export function initMotion(isPaused) {
  const headings = document.querySelectorAll('main h1, main h2');
  headings.forEach(heading => {
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    let index = 0;
    nodes.forEach(node => {
      const fragment = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach(word => {
        if (!word.trim()) { fragment.append(document.createTextNode(word)); return; }
        const mask = document.createElement('span');
        mask.className = 'word-mask';
        const text = document.createElement('span');
        text.className = 'word-reveal';
        text.textContent = word;
        text.style.setProperty('--word-delay', `${index++ * 85}ms`);
        mask.append(text);
        fragment.append(mask);
      });
      node.replaceWith(fragment);
    });
    heading.classList.add('animated-heading');
  });

  const sections = [...document.querySelectorAll('.hero, .intro, .chapter, .closing')];
  const active = new Set();
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        active.add(entry.target);
        entry.target.classList.add('is-revealed');
      } else active.delete(entry.target);
    });
  }, { threshold: .08 });
  sections.forEach(section => { section.classList.add('motion-section'); observer.observe(section); });
  // Keyboard navigation must never land on content waiting for an entrance animation.
  document.addEventListener('focusin', event => event.target.closest('.motion-section')?.classList.add('is-revealed'));

  const progress = document.createElement('div');
  progress.className = 'journey-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.append(progress);
  const heroText = document.querySelector('.hero-text');
  const motionButton = document.querySelector('#motion-toggle');
  // Keep the global pause control reachable after leaving the hero.
  const controlSlot = document.createElement('span');
  motionButton.before(controlSlot);
  new IntersectionObserver(([entry]) => {
    motionButton.classList.toggle('is-docked', !entry.isIntersecting);
    if (entry.isIntersecting) controlSlot.after(motionButton);
    else document.body.append(motionButton);
  }).observe(document.querySelector('.hero'));
  let previous = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || now - previous < 32) return;
    previous = now;
    const distance = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${distance > 0 ? scrollY / distance : 0})`;
    if (isPaused()) {
      heroText.style.removeProperty('translate');
      heroText.style.removeProperty('opacity');
      active.forEach(section => section.style.setProperty('--scene-shift', '0px'));
      return;
    }
    if (active.has(sections[0])) {
      const offset = Math.min(scrollY / innerHeight, 1);
      heroText.style.translate = `0 ${offset * -65}px`;
      heroText.style.opacity = String(Math.max(0, 1 - offset * 1.5));
    }
    active.forEach(section => {
      if (!section.classList.contains('chapter')) return;
      const bounds = section.getBoundingClientRect();
      const travel = Math.max(-1, Math.min(1, (bounds.top + bounds.height / 2 - innerHeight / 2) / innerHeight));
      section.style.setProperty('--scene-shift', `${travel * 34}px`);
    });
  }
  requestAnimationFrame(frame);
}
