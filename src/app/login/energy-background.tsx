"use client";

import { useEffect, useRef } from "react";

const vertexShader = `
  attribute vec2 a_position;
  varying vec2 v_texCoord;

  void main() {
    v_texCoord = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  uniform float u_time;
  varying vec2 v_texCoord;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    vec2 uv = v_texCoord;
    vec2 gridUv = uv * 10.0;
    vec2 id = floor(gridUv);
    vec2 gv = fract(gridUv) - 0.5;
    float speed = u_time * 0.3;
    float grid = smoothstep(0.012, 0.0, abs(gv.x)) + smoothstep(0.012, 0.0, abs(gv.y));
    grid *= 0.2;
    float flow = smoothstep(0.035, 0.0, abs(gv.x - sin(u_time + id.y) * 0.2));
    flow *= smoothstep(0.5, 0.2, abs(fract(gv.y + speed * (hash(id.xx) + 1.0)) - 0.5));
    float heat = smoothstep(0.45, 0.0, length(uv - vec2(0.5 + sin(u_time * 0.2) * 0.3, 0.82)));
    vec3 color = vec3(0.02, 0.05, 0.1);
    color += vec3(0.23, 0.51, 0.96) * flow * 0.7;
    color += vec3(0.23, 0.51, 0.96) * grid * 0.3;
    color += vec3(1.0, 0.4, 0.1) * heat * 0.15;
    color *= max(0.2, 1.0 - length(uv - 0.5) * 1.3);
    gl_FragColor = vec4(color, 1.0);
  }
`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

export function EnergyBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      powerPreference: "low-power",
    });
    if (!gl) return;

    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexShader);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShader);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return;

    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const time = gl.getUniformLocation(program, "u_time");

    let frame = 0;
    let visible = !document.hidden;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.round(canvas.clientWidth * ratio);
      const height = Math.round(canvas.clientHeight * ratio);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
    };

    const draw = (timestamp: number) => {
      resize();
      gl.uniform1f(time, reduceMotion ? 0 : timestamp * 0.001);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (visible && !reduceMotion) frame = requestAnimationFrame(draw);
    };

    const onVisibilityChange = () => {
      visible = !document.hidden;
      cancelAnimationFrame(frame);
      if (visible) frame = requestAnimationFrame(draw);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    frame = requestAnimationFrame(draw);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      cancelAnimationFrame(frame);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 size-full bg-[#040d1d]"
    />
  );
}