import { useState } from "react";
import { fetchSpeedTest } from "../services/speedtest.api";

export function useSpeedTest() {
  const [status, setStatus] = useState("idle");
  const [speed, setSpeed] = useState(0);
  const [result, setResult] = useState(null);

  const animate = (target, done) => {
    let current = 0;
    const step = target / 60;

    function frame() {
      if (current < target) {
        current += step;
        setSpeed(current);
        requestAnimationFrame(frame);
      } else {
        setSpeed(target);
        done && done();
      }
    }

    frame();
  };

  const startTest = async () => {
    setStatus("download");
    const data = await fetchSpeedTest();
    setResult(data);

    animate(Number(data.download), () => {
      setTimeout(() => {
        setSpeed(0);
        setStatus("upload");

        animate(Number(data.upload), () => {
          setStatus("result");
        });
      }, 300);
    });
  };

  return { status, speed, result, startTest };
}
