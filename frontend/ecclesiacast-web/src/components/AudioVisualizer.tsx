import { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  isActive: boolean;
}

export default function AudioVisualizer({ analyser, isActive }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return undefined;
    }

    const render = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);

      if (!isActive || !analyser) {
        context.beginPath();
        context.moveTo(0, canvas.height / 2);
        context.lineTo(canvas.width, canvas.height / 2);
        context.strokeStyle = 'rgba(174, 200, 255, 0.3)';
        context.lineWidth = 2;
        context.stroke();
        frameRef.current = requestAnimationFrame(render);
        return;
      }

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      const barWidth = (canvas.width / bufferLength) * 1.8;
      let x = 0;

      for (let index = 0; index < bufferLength; index += 1) {
        const barHeight = (dataArray[index] / 255) * canvas.height;
        const y = (canvas.height - barHeight) / 2;
        const gradient = context.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, '#f59e0b');
        gradient.addColorStop(1, '#fef3c7');
        context.fillStyle = gradient;
        context.fillRect(x, y, Math.max(barWidth - 1, 1), barHeight);
        x += barWidth;
      }

      frameRef.current = requestAnimationFrame(render);
    };

    frameRef.current = requestAnimationFrame(render);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [analyser, isActive]);

  return <canvas ref={canvasRef} width={360} height={72} className="visualizer-canvas" />;
}
