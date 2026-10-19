const motionOk = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function bind(root) {
  const scroller = root.matches("[data-scroller]") ? root : root.querySelector("[data-scroller]");
  if (!scroller) return;
  const cards = [...scroller.querySelectorAll(".card, .fn-card")];
  const fade = scroller.querySelector(".fn-scroller__fade");
  const dotsHost = scroller.parentElement.querySelector("[data-scroller-dots]");
  if (!cards.length) return;

  const markEnd = () => {
    const atEnd = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 2;
    scroller.toggleAttribute("data-at-end", atEnd);
    if (fade) fade.hidden = atEnd;
  };

  const dots = cards.map((card, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fn-scroller__dot";
    button.setAttribute("aria-label", `Show card ${index + 1}`);
    button.addEventListener("click", () => {
      card.scrollIntoView({ inline: "start", block: "nearest", behavior: motionOk ? "smooth" : "auto" });
    });
    dotsHost?.append(button);
    return button;
  });

  const setActive = (index) => {
    dots.forEach((dot, i) => {
      const on = i === index;
      dot.setAttribute("aria-current", on ? "true" : "false");
    });
  };

  if ("IntersectionObserver" in window) {
    const seen = new Map();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        seen.set(entry.target, entry.isIntersecting && entry.intersectionRatio >= 0.6);
      });
      const index = cards.findIndex((card) => seen.get(card));
      if (index >= 0) setActive(index);
    }, { root: scroller, threshold: 0.6 });
    cards.forEach((card) => observer.observe(card));
  } else {
    setActive(0);
  }

  scroller.addEventListener("scroll", markEnd, { passive: true });
  markEnd();
  setActive(0);
}

document.querySelectorAll("[data-scroller]").forEach((node) => bind(node));
