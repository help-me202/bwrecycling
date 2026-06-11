const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static assets (CSS and Images)
app.use("/CSS", express.static(path.join(__dirname, "CSS")));
app.use("/Images", express.static(path.join(__dirname, "Images")));

// Serve HTML files directly
app.use(express.static(path.join(__dirname, "HTML")));

// Default route to serve the homepage
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "HTML", "index.html"));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
