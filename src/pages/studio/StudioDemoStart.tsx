import { useEffect } from "react";
import { startStudioDemo } from "@/lib/studioDemo";

/**
 * /studio/demo, development builds only: turns the Studio demo on and opens the Studio. A full page
 * load, not a route change, so the app starts again already signed in as the sample organizer.
 */
const StudioDemoStart = () => {
  useEffect(() => {
    startStudioDemo();
    window.location.replace("/studio");
  }, []);
  return null;
};

export default StudioDemoStart;
