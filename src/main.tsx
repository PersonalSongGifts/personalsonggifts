import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

import('@amplitude/unified').then((amplitude) => {
  amplitude.initAll('c8af55590969b980a194dbf61f9ca6a3', {
    analytics: { autocapture: true },
    sessionReplay: { sampleRate: 1 },
  });
});

createRoot(document.getElementById("root")!).render(<App />);
