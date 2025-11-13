// --- CONFIG --------------------------------------------------------
// Update these values for your own setup before deploying to GitHub Pages.

const CONFIG = {
  // 1) Google Apps Script Web App URL (deploy as "Anyone with link")
  GOOGLE_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbzYGvS7VYq8lEG9MAW3r_NXVc9iBNKduWVGbbq2KnlVo-HZfj9KlAyOEtQN7TesmhU72Q/exec",

  // 2) Default season if OCR can't detect it (you can change in the UI anyway)
  DEFAULT_SEASON: "Season 18",

  // 3) Expected character portrait slots on the screenshot.
  //    Coordinates are expressed in *relative* units (0–1) for x, y, width, height
  //    so it will still work if the screenshot resolution changes but the layout stays the same.
  //
  //    These are rough guesses based on the typical MSF crucible screen and WILL
  //    need a bit of tuning by you. Use the preview canvas outline helpers later
  //    if you want to debug.
  IMAGE_SLOTS: {
    attack: [
      { id: "A1", x: 0.11, y: 0.40, w: 0.07, h: 0.25 },
      { id: "A2", x: 0.21, y: 0.40, w: 0.07, h: 0.25 },
      { id: "A3", x: 0.31, y: 0.40, w: 0.07, h: 0.25 },
      { id: "A4", x: 0.41, y: 0.40, w: 0.07, h: 0.25 },
      { id: "A5", x: 0.51, y: 0.40, w: 0.07, h: 0.25 }
    ],
    defense: [
      { id: "D1", x: 0.59, y: 0.40, w: 0.07, h: 0.25 },
      { id: "D2", x: 0.69, y: 0.40, w: 0.07, h: 0.25 },
      { id: "D3", x: 0.79, y: 0.40, w: 0.07, h: 0.25 },
      { id: "D4", x: 0.89, y: 0.40, w: 0.07, h: 0.25 },
      { id: "D5", x: 0.99, y: 0.40, w: 0.07, h: 0.25 }
    ]
  },

  // 4) Portrait library. Put PNGs in /portraits in this repo and list them here.
  //    The "name" field is what will be written into the Google Sheet.
  PORTRAITS: [
    // EXAMPLES ONLY — replace with your real characters and file names.
    { name: "Lady Deathstrike", url: "portraits/lady_deathstrike.png" },
    { name: "Iron Fist", url: "portraits/iron_fist.png" },
    { name: "Iron Fist WWII", url: "portraits/iron_fist_wwii.png" },
    { name: "Sword Master", url: "portraits/sword_master.png" },
    { name: "Steel Serpent", url: "portraits/steel_serpent.png" }
  ]
};
