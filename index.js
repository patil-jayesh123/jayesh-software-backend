const express = require("express");
const app = express();

//import cors
const cors = require("cors");
app.use(cors());

app.use(express.json());

//db import
const connection = require("./config/db.js");

//import auth raute
const auth = require("./routes/auth.js");
app.use("/api/auth", auth);

const noteRouter=require("./routes/note.js")
app.use("/api/note", noteRouter);
 
const PORT = 3000;
const HOST = "0.0.0.0";

app.listen(PORT, HOST, () => {
  connection();
  console.log(`server is running on http://${HOST}:${PORT}`);
});
