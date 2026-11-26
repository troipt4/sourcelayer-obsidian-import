# SourceLayer Import

Import a shared SourceLayer Map or selection into a new Markdown note in Obsidian. Links to YouTube timestamps are preserved when the shared selection includes them.

## Install

Download the latest release and extract its files into `.obsidian/plugins/sourcelayer-import/` in your vault. Reload Obsidian, open **Settings → Community plugins**, and enable **SourceLayer Import**.

## Import a Map

1. In SourceLayer, choose **Shareable link** in the export menu and create a link for the content you want to share.
2. In Obsidian, open the command palette and run **Import shared SourceLayer Map**.
3. Paste the link and choose **Import as new note**.

Each import creates a separate note in the vault's `SourceLayer/` folder. Re-importing preserves any edits to previous notes. A link must still be active at import time. Notes already imported remain in your vault.

## Network use

The plugin sends the token from the pasted link to the [SourceLayer sharing service](https://sourcelayerv3-production.up.railway.app) to retrieve the selected content. An Obsidian user can import an active link without a SourceLayer account. The plugin only writes the imported note inside the current vault.

## License

[MIT](LICENSE)
