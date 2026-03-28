var DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36";

gopeed.events.onResolve(function (ctx) {
  var settings = gopeed.settings || {};
  function isTrue(val) { return val === true || val === "true"; }
  
  var sortByNames = isTrue(settings.sortByNames);
  var sortByDate = isTrue(settings.sortByDate);
  var sortByType = isTrue(settings.sortByType);
  var saveJson = isTrue(settings.saveJson);
  var enableDeduplication = isTrue(settings.enableDeduplication);

  var tweetRegex = /(?:twitter\.com|x\.com|vxtwitter\.com|fxtwitter\.com|fixupx\.com)\/(\w+)\/status\/(\d+)/i;
  var matches = ctx.req.url.match(tweetRegex);
  if (!matches) throw new Error("Invalid Twitter URL");

  var username = matches[1];
  var tweetID = matches[2];

  // 1. Deduplication Check
  if (enableDeduplication && typeof gopeed !== 'undefined' && gopeed.storage) {
    var history = gopeed.storage.get("downloaded_ids") || "";
    if (history.indexOf(tweetID) !== -1) {
      throw new Error("Tweet " + tweetID + " has already been downloaded (Deduplication enabled).");
    }
  }

  return fetch("https://api.vxtwitter.com/" + username + "/status/" + tweetID, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Discordbot/2.0)", "Accept": "application/json" }
  }).then(function (res) {
    if (!res.ok) throw new Error("API failed: " + res.status);
    return res.json();
  }).then(function (metadata) {
    if (!metadata || !metadata.media_extended) throw new Error("No media found");

    var cleanText = (metadata.text || "tweet").replace(/https?:\/\/\S+/g, "").replace(/[^a-zA-Z0-9]+/g, "_").trim();
    var slug = cleanText.substring(0, 50).replace(/^_+|_+$/g, "") || "tweet";
    
    // Path breakout into shared Twitter folder
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
        req: { 
          url: downloadUrl, 
          extra: { header: { "User-Agent": DEFAULT_UA, "Referer": "https://twitter.com/" } } 
        }
      };
    });

    if (saveJson) {
      // Put JSON in the same folder as the first media item
      var jsonPath = breakoutPath;
      if (files.length > 0) jsonPath = files[0].path;

      files.push({
        name: slug + "_" + tweetID + "_metadata.json",
        path: jsonPath,
        req: { 
          url: "https://api.vxtwitter.com/" + username + "/status/" + tweetID,
          extra: { header: { "User-Agent": "Mozilla/5.0 (compatible; Discordbot/2.0)", "Accept": "application/json" } }
        }
      });
    }

    // 2. Update History (Mark as seen)
    if (enableDeduplication && gopeed.storage) {
      var currentHistory = gopeed.storage.get("downloaded_ids") || "";
      gopeed.storage.set("downloaded_ids", currentHistory + "," + tweetID);
    }

    ctx.res = { name: metadata.user_screen_name + "_" + tweetID, files: files };
  }).catch(function (err) {
    if (typeof gopeed !== 'undefined' && gopeed.logger) gopeed.logger.error("Twitter Error: " + err.message);
    throw err;
  });
});
