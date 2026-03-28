const DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36";

gopeed.events.onResolve(async (ctx) => {
  const settings = gopeed.settings || {};
  gopeed.logger.info("Settings received: " + JSON.stringify(settings));
  const isTrue = (val) => val === true || val === "true";
  
  const sortByNames = isTrue(settings.sortByNames);
  const sortByDate = isTrue(settings.sortByDate);
  const sortByType = isTrue(settings.sortByType);
  const saveJson = isTrue(settings.saveJson);

  const url = ctx.req.url;
  const tweetRegex = /(?:twitter\.com|x\.com|vxtwitter\.com|fxtwitter\.com|fixupx\.com)\/(\w+)\/status\/(\d+)/i;
  const matches = url.match(tweetRegex);

  if (!matches) {
    throw new Error("Invalid Twitter/X URL format.");
  }

  const username = matches[1];
  const tweetID = matches[2];

  let metadata = null;
  // Try vxtwitter API
  try {
    const response = await fetch(`https://api.vxtwitter.com/${username}/status/${tweetID}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
        "Accept": "application/json"
      }
    });
    if (response.ok) {
      metadata = await response.json();
    }
  } catch (e) {}

  if (!metadata) throw new Error("Could not find any media. Tweet might be private or deleted.");

  const cleanText = (metadata.text || "tweet")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, "_")
    .trim();
  const slug = cleanText.substring(0, 50).replace(/^_+|_+$/g, "") || "tweet";
  
  // 1. Base Subdir
  let relativePath = "Twitter/";

  // 2. Sort by Name
  if (sortByNames) {
    relativePath += metadata.user_screen_name + "/";
  }

  const files = metadata.media_extended.map((item, index) => {
    let downloadUrl = item.url;
    let ext = ".jpg";
    let typeSubdir = "images/";

    if (item.type === "video" || item.type === "gif" || downloadUrl.includes(".mp4")) {
      ext = ".mp4";
      typeSubdir = "videos/";
    } else if (downloadUrl.includes(".png") || downloadUrl.includes("format=png")) {
      ext = ".png";
    }

    // 3. Sort by Type
    let itemRelativePath = relativePath;
    if (sortByType) {
      itemRelativePath += typeSubdir;
    }

    // 4. Sort by Date
    if (sortByDate && metadata.date_epoch) {
      const date = new Date(metadata.date_epoch * 1000);
      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
      itemRelativePath += dateStr + "/";
    }

    // High quality for twitter images
    if (ext !== ".mp4" && downloadUrl.includes("twimg.com")) {
      if (downloadUrl.includes("?format=") && !downloadUrl.includes("&name=")) {
        downloadUrl += "&name=orig";
      } else if (!downloadUrl.includes("?") && !downloadUrl.includes(":orig")) {
        downloadUrl += ":orig";
      }
    }

    const fileName = `${slug}_${metadata.tweetID}_${index + 1}${ext}`;
    
    return {
      name: fileName,
      path: itemRelativePath, // Use the path field for subdirectories!
      req: {
        url: downloadUrl,
        extra: {
          header: {
            "User-Agent": DEFAULT_UA,
            "Referer": "https://twitter.com/"
          }
        }
      }
    };
  });

  // 5. Save JSON metadata
  if (saveJson) {
    const jsonContent = JSON.stringify(metadata, null, 2);
    files.push({
      name: `${slug}_${metadata.tweetID}_metadata.json`,
      path: relativePath,
      req: {
        url: "data:application/json;base64," + Buffer.from(jsonContent).toString('base64'),
      }
    });
  }

  ctx.res = {
    name: `${metadata.user_screen_name}_${metadata.tweetID}`,
    files: files
  };
});
