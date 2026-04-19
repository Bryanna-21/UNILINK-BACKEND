const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("UniLink API is running...");
});

module.exports = app;
const postRoutes = require("./routes/postRoutes");
app.use("/api/posts", postRoutes);
