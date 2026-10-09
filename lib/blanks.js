// The three ORICAN blanks (option A: everything from OPT OnDemand, Czechia, so mixed orders ship once).
// Colors are Printify's exact names for this provider; hex values are hand-picked for the swatches.
const SHOP_ID = 7881083; // Printify "My new store" (not connected to a sales channel) - used for API orders
const PROVIDER_ID = 30;  // OPT OnDemand (CZ)

const BLANKS = [
  {
    key: "crew",
    name: "Crew tee",
    blueprint_id: 12, // Bella+Canvas 3001 Unisex Jersey Short Sleeve Tee
    sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL"],
    colors: {
      "White": "#F6F6F4",
      "Natural": "#EDE3CF",
      "Athletic Heather": "#C9C9C7",
      "Black": "#1B1C1E",
      "Navy": "#23283A",
      "True Royal": "#2B4FA8",
      "Heather Olive": "#8A8C6A",
      "Lavender Dust": "#B8A9C9",
      "Mustard": "#D9A633",
      "Red": "#C3262E",
    },
  },
  {
    key: "vneck",
    name: "V-neck tee",
    blueprint_id: 142, // Gildan 64V00 Men's Fitted V-Neck Short Sleeve Tee
    sizes: ["S", "M", "L", "XL", "2XL"],
    colors: {
      "White": "#F6F6F4",
      "Black": "#1B1C1E",
      "Navy": "#23283A",
      "Royal": "#2A4BA0",
    },
  },
  {
    key: "heavy",
    name: "Heavy crew tee",
    blueprint_id: 6, // Gildan 5000 Unisex Heavy Cotton Tee
    sizes: ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
    colors: {
      "White": "#F6F6F4",
      "Natural": "#EFE6D2",
      "Sand": "#D8C8A8",
      "Sport Grey": "#9C9EA0",
      "Dark Heather": "#4A4C50",
      "Black": "#1B1C1E",
      "Navy": "#23283A",
      "Military Green": "#5E6447",
      "Maroon": "#5C1E2A",
      "Dark Chocolate": "#3E2C24",
    },
  },
];

module.exports = { SHOP_ID, PROVIDER_ID, BLANKS };
