const express = require("express");
const cors = require("cors");
const speedRoutes = require("./routes/speed");

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

app.use("/api/speedtest", speedRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
