const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const postRoutes = require("./routes/post.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/posts", postRoutes);

module.exports = app;
