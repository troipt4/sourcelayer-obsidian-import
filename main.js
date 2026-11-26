/* global require, module, crypto, TextEncoder */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Modal, Notice, Plugin, Setting, TFolder, requestUrl } = require("obsidian");

const appOrigin = "https://sourcelayerv3-production.up.railway.app";
const sourceFolder = "SourceLayer";
const sourceUrlPattern = /^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})$/u;
const timeLink = /\[([0-9:]+)\]\((https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}&t=[0-9]+)\)/gu;
const maxBytes = 512 * 1024;

function shareToken(value) {
  try {
    const url = new URL(value.trim());
    const token = url.hash.slice(1);
    if (url.origin === appOrigin && url.pathname === "/shared-map.html" && !url.search && !url.username && !url.password &&
      /^[A-Za-z0-9_-]{43}$/u.test(token)) return token;
  } catch { /* Invalid or incomplete URL. */ }
  return undefined;
}

function escapeText(text) {
  return text.replace(/[\\*_{}[\]<>#!|^~=]/gu, "\\$&").replace(/\x60/gu, "\\$&");
}

function safeNote(markdown, sourceUrl) {
  function inline(text) {
    let result = "";
    let offset = 0;
    for (const match of text.matchAll(timeLink)) {
      result += escapeText(text.slice(offset, match.index));
      result += match[2].startsWith(sourceUrl + "&t=") ? match[0] : escapeText(match[0]);
      offset = match.index + match[0].length;
    }
    return result + escapeText(text.slice(offset));
  }
  return markdown.replace(/\r\n?/gu, "\n").split("\n").map(line => {
    const clean = line.replace(/\p{Cc}/gu, "").replace(/\\([\\*_{}[\]<>#!|^~=]|\x60)/gu, "$1");
    const heading = /^(#{1,3}) (.*)$/u.exec(clean);
    const bullet = /^( {0,48})- (.*)$/u.exec(clean);
    if (heading) return heading[1] + " " + inline(heading[2]);
    if (bullet) return bullet[1] + "- " + inline(bullet[2]);
    const indent = /^ {0,48}/u.exec(clean)[0];
    const text = inline(clean.trim());
    return text && /^[-+]/u.test(text) ? indent + "\\" + text : indent + text;
  }).join("\n").trimEnd() + "\n";
}

async function importShare(plugin, link) {
  const token = shareToken(link);
  if (!token) throw new Error("Enter a SourceLayer share link.");
  let snapshot;
  try {
    const response = await requestUrl({
      url: appOrigin + "/api/shared-map/read", method: "POST", throw: false,
      contentType: "application/json", body: JSON.stringify({ token }),
    });
    if (response.status === 404) throw new Error("invalid link");
    if (response.status !== 200) throw new Error("request failed");
    snapshot = response.json?.snapshot;
  } catch { throw new Error("The shared Map could not be opened. It may have expired or been revoked."); }
  const id = typeof snapshot?.sourceUrl === "string" && sourceUrlPattern.exec(snapshot.sourceUrl)?.[1];
  if (!id || typeof snapshot.title !== "string" || !snapshot.title.trim() || snapshot.title.length > 300 ||
    typeof snapshot.markdown !== "string" || !snapshot.markdown.trim() || snapshot.markdown.length > maxBytes ||
    new TextEncoder().encode(snapshot.markdown).length > maxBytes) throw new Error("SourceLayer returned an invalid shared Map.");

  const title = Array.from(snapshot.title.normalize("NFC").replace(/[\\/:*?"<>|#^[\]\p{Cc}]/gu, " ").replace(/\s+/gu, " ").trim())
    .slice(0, 72).join("").replace(/^[. ]+|[. ]+$/gu, "") || "Shared Map";
  const vault = plugin.app.vault;
  if (vault.getAbstractFileByPath(sourceFolder) === null) {
    try { await vault.createFolder(sourceFolder); }
    catch (error) { if (!(vault.getAbstractFileByPath(sourceFolder) instanceof TFolder)) throw error; }
  }
  if (!(vault.getAbstractFileByPath(sourceFolder) instanceof TFolder)) throw new Error("Rename the existing SourceLayer file so the folder can be created.");
  const name = title + " - " + id + " - " + crypto.randomUUID().slice(0, 18) + ".md";
  const note = "---\nvideo_id: " + JSON.stringify(id) + "\nsource_url: " + JSON.stringify(snapshot.sourceUrl) +
    "\n---\n\n" + safeNote(snapshot.markdown, snapshot.sourceUrl);
  return vault.create(sourceFolder + "/" + name, note);
}

class ImportModal extends Modal {
  constructor(plugin, initialLink = "") {
    super(plugin.app);
    this.plugin = plugin;
    this.link = initialLink;
  }

  onOpen() {
    this.setTitle("Import shared SourceLayer Map");
    new Setting(this.contentEl).setName("SourceLayer share link").addText(input => {
      input.setValue(this.link).setPlaceholder("Paste the share link").onChange(value => { this.link = value; });
    });
    const status = this.contentEl.createEl("p", { attr: { role: "status" } });
    new Setting(this.contentEl).addButton(button => button.setButtonText("Import as new note").setCta().onClick(async () => {
      button.setDisabled(true);
      status.setText("Importing…");
      try {
        const note = await this.plugin.importLink(this.link);
        this.close();
        new Notice("Imported a new SourceLayer note.");
        await this.plugin.app.workspace.getLeaf(true).openFile(note).catch(() => undefined);
      } catch (error) {
        status.setText(error instanceof Error ? error.message : "The SourceLayer note could not be imported.");
        button.setDisabled(false);
      }
    }));
  }

  onClose() { this.contentEl.empty(); }
}

module.exports = class SourceLayerImport extends Plugin {
  importLink(url) { return importShare(this, url); }

  onload() {
    this.addCommand({
      id: "import-shared-map",
      name: "Import shared SourceLayer Map",
      callback: () => new ImportModal(this).open(),
    });
    this.registerObsidianProtocolHandler("sourcelayer-import", fields => {
      if (typeof fields.url === "string" && shareToken(fields.url)) new ImportModal(this, fields.url).open();
      else new Notice("Enter a valid SourceLayer share link.");
    });
  }
};
