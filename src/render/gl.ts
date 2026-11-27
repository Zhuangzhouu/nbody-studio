/** WebGL 小工具：着色器编译、程序链接、uniform 定位。 */

export function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('无法创建着色器对象');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '未知编译错误';
    gl.deleteShader(shader);
    throw new Error(`着色器编译失败：${log}\n${source}`);
  }
  return shader;
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const vs = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('无法创建程序对象');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? '未知链接错误';
    gl.deleteProgram(program);
    throw new Error(`程序链接失败：${log}`);
  }
  return program;
}

export type UniformMap = Record<string, WebGLUniformLocation | null>;

export function getUniforms(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: string[],
): UniformMap {
  const map: UniformMap = {};
  for (const name of names) map[name] = gl.getUniformLocation(program, name);
  return map;
}
