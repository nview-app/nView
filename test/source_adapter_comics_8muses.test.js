const test = require("node:test");
const assert = require("node:assert/strict");

const { comics8musesSourceAdapter } = require("../preload/source_adapters/comics_8muses");
const { rewriteThumbToImageUrl } = require("../preload/source_adapters/comics_8muses/page_list_extractor");

function makeElement({ text = "", attrs = {}, dataset = {} } = {}) {
  return {
    textContent: text,
    dataset,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
  };
}

test("comics_8muses adapter matches /comics/album/* and /comics/album/*/* URL shapes", () => {
  assert.equal(comics8musesSourceAdapter.matchesUrl("https://comics.8muses.com/"), false);
  assert.equal(comics8musesSourceAdapter.matchesUrl("https://comics.8muses.com/comics/album/artist"), false);
  assert.equal(comics8musesSourceAdapter.matchesUrl("https://comics.8muses.com/comics/album/artist/comic"), true);
  assert.equal(comics8musesSourceAdapter.matchesUrl("https://comics.8muses.com/comics/album/artist/comic/Issue-3"), true);
  assert.equal(comics8musesSourceAdapter.matchesUrl("https://comics.8muses.com/comics/album/artist/comic/Issue-3/extra"), false);
  assert.equal(comics8musesSourceAdapter.matchesUrl("https://example.com/comics/album/artist/comic/Issue-3"), false);
});

test("comics_8muses metadata extractor returns title and artist from breadcrumb", () => {
  const documentRef = {
    querySelector(selector) {
      if (selector === "head title") return makeElement({ text: "Comic Title - Issue 3" });
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.top-menu-breadcrumb ol li a[href^="/comics/album/"]') {
        return [
          makeElement({ text: "Artist Name", attrs: { href: "/comics/album/artist-name" } }),
          makeElement({ text: "Comic Title", attrs: { href: "/comics/album/artist-name/comic-title" } }),
          makeElement({ text: "Issue 3", attrs: { href: "/comics/album/artist-name/comic-title/Issue-3" } }),
        ];
      }
      return [];
    },
  };
  const locationRef = {
    href: "https://comics.8muses.com/comics/album/artist-name/comic-title/Issue-3",
    pathname: "/comics/album/artist-name/comic-title/Issue-3",
  };

  const meta = comics8musesSourceAdapter.extractMetadata(documentRef, locationRef);

  assert.equal(meta.sourceUrl, locationRef.href);
  assert.equal(meta.galleryId, "comics/album/artist-name/comic-title/Issue-3");
  assert.equal(meta.comicName, "Comic Title - Issue 3");
  assert.equal(meta.artist, "Artist Name");
  assert.deepEqual(meta.artists, ["Artist Name"]);
  assert.deepEqual(meta.tags, []);
  assert.equal(meta.pages, null);
});

test("comics_8muses page image extractor upgrades /image/th/ to /image/fm/ and deduplicates", () => {
  const documentRef = {
    querySelectorAll(selector) {
      if (selector !== ".gallery img") return [];
      return [
        makeElement({ attrs: { "data-src": "/image/th/abc.jpg" } }),
        makeElement({ attrs: { src: "https://comics.8muses.com/image/th/def.jpg" } }),
        makeElement({ attrs: { src: "https://comics.8muses.com/image/th/def.jpg" } }),
      ];
    },
  };
  const locationRef = { href: "https://comics.8muses.com/comics/album/artist-name/comic-title/Issue-3" };

  assert.equal(rewriteThumbToImageUrl("javascript:alert(1)", locationRef.href), "");

  const urls = comics8musesSourceAdapter.extractPageImageUrls(documentRef, locationRef);

  assert.deepEqual(urls, [
    "https://comics.8muses.com/image/fm/abc.jpg",
    "https://comics.8muses.com/image/fm/def.jpg",
  ]);
});
