var DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36";

function base64Encode(str) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var out = "", i = 0, len = str.length, c1, c2, c3;
  while (i < len) {
    c1 = str.charCodeAt(i++) & 0xff;
    if (i == len) {
      out += chars.charAt(c1 >> 2);
      out += chars.charAt((c1 & 0x3) << 4);
      out += "==";
      break;
    }
    c2 = str.charCodeAt(i++);
    if (i == len) {
      out += chars.charAt(c1 >> 2);
      out += chars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xF0) >> 4));
      out += chars.charAt((c2 & 0xF) << 2);
      out += "=";
      break;
    }
    c3 = str.charCodeAt(i++);
    out += chars.charAt(c1 >> 2);
    out += chars.charAt(((c1 & 0x3) << 4) | ((c2 & 0xF0) >> 4));
    out += chars.charAt(((c2 & 0xF) << 2) | ((c3 & 0xC0) >> 6));
    out += chars.charAt(c3 & 0x3F);
  }
  return out;
}

gopeed.events.onResolve(function (ctx) {
  var settings = gopeed.settings || {};
  function isTrue(val) { return val === true || val === "true"; }
  
  var sortByNames = isTrue(settings.sortByNames);
  var sortByDate = isTrue(settings.sortByDate);
  var sortByType = isTrue(settings.sortByType);
  var saveJson = isTrue(settings.saveJson);

  var tweetRegex = /(?:twitter\.com|x\.com|vxtwitter\.com|fxtwitter\.com|fixupx\.com)\/(\w+)\/status\/(\d+)/i;
  var matches = ctx.req.url.match(tweetRegex);
  if (!matches) throw new Error("Invalid Twitter URL");

  var username = matches[1];
  var tweetID = matches[2];

  return fetch("https://api.vxtwitter.com/" + username + "/status/" + tweetID, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Discordbot/2.0)", "Accept": "application/json" }
  }).then(function (res) {
    if (!res.ok) throw new Error("API failed: " + res.status);
    return res.json();
  }).then(function (metadata) {
    if (!metadata || !metadata.media_extended) throw new Error("No media found");

    var cleanText = (metadata.text || "tweet").replace(/https?:\/\/\S+/g, "").replace(/[^a-zA-Z0-9]+/g, "_").trim();
    var slug = cleanText.substring(0, 50).replace(/^_+|_+$/g, "") || "tweet";
    var breakoutPath = "../Twitter/";
    if (sortByNames) breakoutPath += metadata.user_screen_name + "/";
    
    var dateStr = "";
    if (metadata.date_epoch) {
      dateStr = new Date(metadata.date_epoch * 1000).toISOString().split('T')[0];
    }

    var files = metadata.media_extended.map(function (item, index) {
      var downloadUrl = item.url;
      var ext = ".jpg";
      var typeSub = "images/";
      if (item.type === "video" || item.type === "gif" || downloadUrl.indexOf(".mp4") !== -1) {
        ext = ".mp4";
        typeSub = "videos/";
      }
      
      var itemPath = breakoutPath;
      if (sortByType) itemPath += typeSub;
      if (sortByDate && dateStr) itemPath += dateStr + "/";

      if (ext === ".jpg" && downloadUrl.indexOf("twimg.com") !== -1) {
        downloadUrl += downloadUrl.indexOf("?") !== -1 ? "&name=orig" : ":orig";
      }

      return {
        name: slug + "_" + tweetID + "_" + (index + 1) + ext,
        path: itemPath,
        req: { url: downloadUrl, extra: { header: { "User-Agent": DEFAULT_UA, "Referer": "https://twitter.com/" } } }
      };
    });

    if (saveJson) {
      files.push({
        name: slug + "_" + tweetID + "_metadata.json",
        path: breakoutPath,
        req: { url: "data:application/json;base64," + base64Encode(JSON.stringify(metadata, null, 2)) }
      });
    }

    ctx.res = { name: metadata.user_screen_name + "_" + tweetID, files: files };
  }).catch(function (err) {
    if (typeof gopeed !== 'undefined' && gopeed.logger) gopeed.logger.error("Twitter Error: " + err.message);
  });
});
