/**
 * Thin wrapper over hls.js that turns the many ways a public stream can fail
 * into a single named reason, so the interface can say something true about it.
 */

const START_TIMEOUT = 15000;
const PAGE_IS_HTTPS = location.protocol === "https:";

/** Reasons, each with copy the player shows verbatim. */
export const REASONS = {
  insecure: {
    head: "Blocked by the browser",
    body: "This source is served over plain http, and a page loaded over https is not allowed to fetch it. Other sources for this channel may still work.",
  },
  dash: {
    head: "Format not supported",
    body: "This is an MPEG-DASH stream. Tuner plays HLS only, which covers almost every other source in the list.",
  },
  headers: {
    head: "Stream needs a desktop player",
    body: "This source only answers requests carrying a specific User-Agent or Referer, and browsers forbid a page from setting either. It will play in VLC or mpv.",
  },
  cors: {
    head: "Broadcaster refused the browser",
    body: "The server is up but does not allow other sites to read it, so the browser dropped the response. A CORS proxy in Settings gets around this.",
  },
  gone: {
    head: "Source is gone",
    body: "The server answered, but there is nothing at this address any more.",
  },
  forbidden: {
    head: "Not available here",
    body: "The server refused the request. This usually means the channel is limited to viewers in another country.",
  },
  timeout: {
    head: "No response",
    body: "The server took too long to send anything back.",
  },
  media: {
    head: "Stream is unreadable",
    body: "Video arrived but the browser could not decode it, which usually means a codec it does not ship.",
  },
  notstream: {
    head: "Not a stream any more",
    body: "The address answered, but with something that is not a playlist — usually a shutdown notice left where the stream used to be.",
  },
  unsupported: {
    head: "Playback unavailable",
    body: "This browser cannot play HLS. Chrome, Edge, Firefox and Safari all can.",
  },
  network: {
    head: "Source is not responding",
    body: "The stream could not be reached. It may be offline, or briefly overloaded.",
  },
};

const isHls = (url) =>
  /\.m3u8/i.test(url) || !/\.(mpd|mp4|flv|ogg|ts)(\?|$)/i.test(url);

function fail(reason) {
  const err = new Error(reason);
  err.reason = reason;
  return err;
}

/**
 * A host that refuses cross-origin reads and a host that is simply gone both
 * surface as status 0. An opaque no-cors request still completes for the first
 * and still fails for the second, which is the only way to tell them apart.
 */
async function reachable(url) {
  try {
    await fetch(url, {
      mode: "no-cors",
      method: "GET",
      cache: "no-store",
      redirect: "follow",
    });
    return true;
  } catch {
    return false;
  }
}

async function classify(data, source, url) {
  if (data.type === "mediaError") return "media";
  const details = String(data.details || "");
  if (
    details.includes("manifestParsing") ||
    details.includes("IncompatibleCodecs")
  )
    return "notstream";
  const status = data.response?.code ?? 0;
  if (status === 404 || status === 410) return "gone";
  if (status === 401 || status === 403)
    return source?.h ? "headers" : "forbidden";
  if (details.includes("TimeOut")) return "timeout";
  if (status === 0) {
    if (source?.h) return "headers";
    return (await reachable(url)) ? "cors" : "network";
  }
  return "network";
}

export class Player {
  #video;
  #hls = null;
  #timer = null;
  #token = 0;

  /** @param onLevels called with the available renditions once a manifest parses. */
  constructor(video, { onLevels = () => {} } = {}) {
    this.#video = video;
    this.onLevels = onLevels;
  }

  get muted() {
    return this.#video.muted;
  }

  /**
   * Starts one source. Resolves once frames are flowing; rejects with
   * `err.reason` naming a key of REASONS.
   */
  async start(source, { proxy = "" } = {}) {
    const token = ++this.#token;
    this.stop(false);

    if (source.x && PAGE_IS_HTTPS && !proxy) throw fail("insecure");
    if (source.d) throw fail("dash");

    const url = proxy ? proxy + encodeURIComponent(source.u) : source.u;
    const video = this.#video;

    if (!isHls(url)) return this.#playNative(url, token);

    if (window.Hls?.isSupported()) {
      return this.#playHls(url, source, token);
    }
    // Safari and iOS play HLS in the element itself, where hls.js is unsupported.
    if (video.canPlayType("application/vnd.apple.mpegurl"))
      return this.#playNative(url, token);
    throw fail("unsupported");
  }

  #settled(token) {
    return token !== this.#token;
  }

  #playHls(url, source, token) {
    return new Promise((resolve, reject) => {
      const hls = new window.Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        manifestLoadingTimeOut: 12000,
        manifestLoadingMaxRetry: 1,
        levelLoadingMaxRetry: 2,
        fragLoadingMaxRetry: 3,
      });
      this.#hls = hls;
      let recovered = false;

      const done = (err) => {
        clearTimeout(this.#timer);
        if (this.#settled(token)) return;
        if (err) {
          this.stop(false);
          reject(err);
        } else resolve();
      };

      this.#timer = setTimeout(() => done(fail("timeout")), START_TIMEOUT);

      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        if (this.#settled(token)) return;
        this.onLevels(
          hls.levels.map((l, i) => ({
            i,
            height: l.height,
            bitrate: l.bitrate,
          })),
        );
        this.#attemptPlay();
      });

      hls.on(window.Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal || this.#settled(token)) return;
        // A decode hiccup mid-stream is often recoverable; give it one chance.
        if (data.type === "mediaError" && !recovered) {
          recovered = true;
          hls.recoverMediaError();
          return;
        }
        classify(data, source, url).then((reason) => done(fail(reason)));
      });

      this.#video.addEventListener("playing", () => done(null), { once: true });
      hls.loadSource(url);
      hls.attachMedia(this.#video);
    });
  }

  #playNative(url, token) {
    return new Promise((resolve, reject) => {
      const video = this.#video;
      const done = (err) => {
        clearTimeout(this.#timer);
        video.removeEventListener("playing", ok);
        video.removeEventListener("error", bad);
        if (this.#settled(token)) return;
        if (err) reject(err);
        else resolve();
      };
      const ok = () => done(null);
      // The element hides the cause, so the generic reason is the honest one.
      const bad = () =>
        done(fail(video.error?.code === 3 ? "media" : "network"));

      video.addEventListener("playing", ok);
      video.addEventListener("error", bad);
      this.#timer = setTimeout(() => done(fail("timeout")), START_TIMEOUT);
      video.src = url;
      this.#attemptPlay();
    });
  }

  /** Autoplay with sound is usually refused; falling back to muted still shows picture. */
  async #attemptPlay() {
    try {
      await this.#video.play();
    } catch {
      this.#video.muted = true;
      try {
        await this.#video.play();
      } catch {
        /* the element's controls remain */
      }
    }
  }

  setLevel(index) {
    if (this.#hls) this.#hls.currentLevel = index;
  }

  stop(bumpToken = true) {
    if (bumpToken) this.#token++;
    clearTimeout(this.#timer);
    if (this.#hls) {
      this.#hls.destroy();
      this.#hls = null;
    }
    this.#video.removeAttribute("src");
    this.#video.load();
  }
}
