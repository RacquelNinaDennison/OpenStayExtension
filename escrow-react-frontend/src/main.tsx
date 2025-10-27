import { Buffer } from "buffer";
import process from "process";
(window as any).global = window;
(window as any).process = (window as any).process || process;
(window as any).Buffer = (window as any).Buffer || Buffer;

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
