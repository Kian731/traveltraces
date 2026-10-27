(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const header = document.querySelector('.site-header');
  const progress = document.querySelector('.scroll-progress span');
  const appRoot = document.querySelector('#app');

  function updateScrollDetails() {
    const top = window.scrollY;
    const available = document.documentElement.scrollHeight - window.innerHeight;
    header?.classList.toggle('is-scrolled', top > 12);
    progress?.style.setProperty('--scroll', `${available > 0 ? Math.min(100, top / available * 100) : 0}%`);

    if (!reducedMotion.matches) {
      document.querySelector('.hero')?.style.setProperty('--hero-shift', `${Math.min(42, top * .07)}px`);
    }
  }

  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: .08, rootMargin: '0px 0px -28px' });

  function prepareReveals(root = document) {
    if (reducedMotion.matches) return;
    root.querySelectorAll('.section, .stats, .page-intro, .trip-hero, .settings-intro, .settings-card').forEach(element => {
      if (element.classList.contains('reveal-ready')) return;
      element.classList.add('reveal-ready');
      revealObserver.observe(element);
    });
  }

  function enableCarouselWheel(root = document) {
    root.querySelectorAll('.country-carousel').forEach(carousel => {
      if (carousel.dataset.wheelReady) return;
      carousel.dataset.wheelReady = 'true';
      carousel.addEventListener('wheel', event => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || carousel.scrollWidth <= carousel.clientWidth) return;
        event.preventDefault();
        carousel.scrollBy({ left: event.deltaY, behavior: 'smooth' });
      }, { passive: false });
    });
  }

  function refreshEnhancements() {
    prepareReveals(appRoot);
    enableCarouselWheel(appRoot);
    updateScrollDetails();
  }

  let frame;
  window.addEventListener('scroll', () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      updateScrollDetails();
      frame = null;
    });
  }, { passive: true });

  new MutationObserver(refreshEnhancements).observe(appRoot, { childList: true });
  window.addEventListener('resize', updateScrollDetails, { passive: true });
  reducedMotion.addEventListener?.('change', refreshEnhancements);
  refreshEnhancements();
})();
