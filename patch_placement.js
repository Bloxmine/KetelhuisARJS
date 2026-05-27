const { JSDOM } = require("jsdom");
const fs = require('fs');
const html = fs.readFileSync('interaction.html', 'utf8');
const dom = new JSDOM(html);
const doc = dom.window.document;
const btn = doc.getElementById('place-rig-button');
const rig = doc.getElementById('rig-root');
console.log("Button exists:", !!btn, "Rig exists:", !!rig);
