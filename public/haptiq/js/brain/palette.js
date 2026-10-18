// Haptiq's brand colours, read from the CSS tokens in css/styles.css so the
// 3D scene and the page never drift apart. Modules run after the stylesheet loads.

const css = getComputedStyle(document.documentElement);
const token = (name) => css.getPropertyValue(`--${name}`).trim();

export const HAPTIQ = {
  navy: token("navy"),
  slate: token("slate"),
  muted: token("muted"),
  taupe: token("taupe"),
  cream: token("cream"),
};
