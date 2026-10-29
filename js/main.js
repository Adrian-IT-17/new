document.documentElement.classList.add("js");

const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const desktopNavigation = window.matchMedia("(min-width: 1024px)");
const canAnimate = () => !motionPreference.matches && typeof Element.prototype.animate === "function";
const play = (element, frames, options = {}) => {
  if (!element || !canAnimate()) return null;
  return element.animate(frames, { duration: 320, easing: "cubic-bezier(.22,1,.36,1)", ...options });
};
const finished = (animation) => animation?.finished.catch(() => {});

const siteHeader = document.querySelector("[data-site-header]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const navigation = document.querySelector("[data-navigation]");
navigation?.querySelectorAll("a").forEach((link, index) => link.style.setProperty("--nav-order", index));
const obscuredContent = [...document.querySelectorAll("main, footer, .utility-bar, .mobile-contact")];

const setNavigation = (open, returnFocus = false) => {
  if (!menuToggle || !navigation) return;
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
  navigation.classList.toggle("is-open", open);
  document.body.classList.toggle("menu-open", open);
  obscuredContent.forEach((element) => { element.inert = open; });
  if (open) navigation.querySelector("a")?.focus({ preventScroll: true });
  else if (returnFocus) menuToggle.focus({ preventScroll: true });
};

const setHeaderState = () => siteHeader?.classList.toggle("is-scrolled", window.scrollY > 12);
setHeaderState();
window.addEventListener("scroll", setHeaderState, { passive: true });
menuToggle?.addEventListener("click", () => {
  setNavigation(menuToggle.getAttribute("aria-expanded") !== "true", true);
});
desktopNavigation.addEventListener("change", () => {
  if (desktopNavigation.matches) setNavigation(false);
});
navigation?.addEventListener("click", (event) => {
  if (event.target.closest("a")) setNavigation(false);
});

document.addEventListener("keydown", (event) => {
  if (menuToggle?.getAttribute("aria-expanded") !== "true") return;
  if (event.key === "Escape") {
    event.preventDefault();
    setNavigation(false, true);
  }
  if (event.key !== "Tab") return;
  const controls = [menuToggle, ...navigation.querySelectorAll("a[href]")];
  const current = controls.indexOf(document.activeElement);
  if (event.shiftKey && current <= 0) {
    event.preventDefault();
    controls.at(-1).focus();
  } else if (!event.shiftKey && current === controls.length - 1) {
    event.preventDefault();
    menuToggle.focus();
  }
});
document.addEventListener("focusin", (event) => {
  if (menuToggle?.getAttribute("aria-expanded") === "true" &&
      event.target !== menuToggle && !navigation.contains(event.target)) {
    navigation.querySelector("a")?.focus({ preventScroll: true });
  }
});

// Tap and keyboard feedback uses scale, independent of reveal transforms.
// Animations have no forward fill, so hover feedback stays responsive.
const controlAnimations = new WeakMap();
const animateControl = (control) => {
  if (!control || control.matches(":disabled") || !canAnimate()) return;
  controlAnimations.get(control)?.cancel();
  const compressed = control.matches(".gallery-card, .preview-card") ? ".985" : ".95";
  const animation = play(control, [
    { scale: "1" },
    { scale: compressed, offset: .3 },
    { scale: "1" },
  ], { duration: 360 });
  controlAnimations.set(control, animation);
};
document.addEventListener("pointerdown", (event) => {
  if (event.button === 0) animateControl(event.target.closest("button, a"));
}, { passive: true });
document.addEventListener("keydown", (event) => {
  if (event.repeat || !["Enter", " "].includes(event.key)) return;
  const control = event.target.closest("button, a");
  if (event.key === " " && control?.tagName !== "BUTTON") return;
  animateControl(control);
});

// Normalize / and /index.html so Live Server does not reload same-page links.
const normalizedPath = (path) => path.replace(/\/index\.html$/, "/");
document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href]");
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey ||
      event.ctrlKey || event.shiftKey || event.altKey || link.target === "_blank" ||
      link.hasAttribute("download")) return;
  const url = new URL(link.href, window.location.href);
  if (url.origin !== location.origin || normalizedPath(url.pathname) !== normalizedPath(location.pathname) ||
      url.search !== location.search || !url.hash) return;
  let target;
  try { target = document.getElementById(decodeURIComponent(url.hash.slice(1))); } catch { return; }
  if (!target) return;
  event.preventDefault();
  setNavigation(false);
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
  target.scrollIntoView({ behavior: motionPreference.matches ? "instant" : "smooth", block: "start" });
  if (location.hash !== url.hash) history.pushState(null, "", url.hash);
});

// Reveal cards individually so tall grids cannot remain invisible offscreen.
document.querySelectorAll(".gallery-preview-grid.reveal, .gallery-grid.reveal").forEach((grid) => {
  grid.classList.remove("reveal");
  [...grid.children].forEach((child) => child.classList.add("reveal"));
});
document.querySelectorAll(".journey-steps > li, .planning-strip-inner, .footer-grid > div").forEach((item) => item.classList.add("reveal"));
const revealElements = [...document.querySelectorAll(".reveal")];
let revealObserver;
const revealAll = () => {
  revealObserver?.disconnect();
  document.documentElement.classList.remove("motion-ready");
  revealElements.forEach((item) => item.classList.add("is-visible"));
};
if (!motionPreference.matches && "IntersectionObserver" in window) {
  try {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: .06, rootMargin: "0px 0px -20px 0px" });
    revealElements.forEach((item) => {
      const siblings = [...item.parentElement.children].filter((child) => child.classList.contains("reveal"));
      item.style.setProperty("--reveal-delay", Math.min(siblings.indexOf(item), 4) * 65 + "ms");
      revealObserver.observe(item);
    });
    document.documentElement.classList.add("motion-ready");
  } catch { revealAll(); }
} else revealAll();
motionPreference.addEventListener("change", () => {
  if (motionPreference.matches) {
    revealAll();
    document.getAnimations().forEach((animation) => animation.finish());
  }
});

// Indicate the active page or the section being read.
const navLinks = [...(navigation?.querySelectorAll("a:not(.button)") || [])];
if (location.pathname.endsWith("gallery.html")) {
  navLinks.find((link) => link.getAttribute("href") === "gallery.html")?.setAttribute("aria-current", "page");
} else if ("IntersectionObserver" in window) {
  const sectionObserver = new IntersectionObserver((entries) => {
    const entry = entries.find((item) => item.isIntersecting);
    if (!entry) return;
    navLinks.forEach((link) => {
      const active = link.hash === "#" + entry.target.id;
      if (active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  }, { rootMargin: "-15% 0px -55% 0px", threshold: 0 });
  document.querySelectorAll("main section[id], #contact").forEach((section) => sectionObserver.observe(section));
}

const filterButtons = [...document.querySelectorAll("[data-filter]")];
const galleryItems = [...document.querySelectorAll("[data-gallery-item]")];
const galleryGrid = document.querySelector("[data-gallery-grid]");
const galleryStatus = document.querySelector("[data-gallery-status]");
const lightbox = document.querySelector("[data-lightbox]");
const lightboxPanel = document.querySelector(".lightbox-panel");
const lightboxFigure = document.querySelector(".lightbox-figure");
const lightboxImage = document.querySelector("[data-lightbox-image]");
const lightboxCaption = document.querySelector("[data-lightbox-caption]");
const lightboxCount = document.querySelector("[data-lightbox-count]");
const lightboxClose = document.querySelector("[data-lightbox-close]");
let visibleGalleryItems = galleryItems;
let currentLightboxIndex = 0;
let lastLightboxTrigger;
let photoRequest = 0;
let photoAnimation;

const setLightboxContent = async (index, direction = 1) => {
  if (!lightboxImage || !lightboxCaption || !visibleGalleryItems.length) return;
  const request = ++photoRequest;
  currentLightboxIndex = (index + visibleGalleryItems.length) % visibleGalleryItems.length;
  const item = visibleGalleryItems[currentLightboxIndex];
  const source = item.querySelector("img");
  const caption = item.dataset.caption || source.alt;
  lightbox.setAttribute("aria-busy", "true");
  photoAnimation?.cancel();
  const preview = new Image();
  preview.src = source.currentSrc || source.src;
  await preview.decode().catch(() => {});
  if (request !== photoRequest || !lightbox.open || lightbox.classList.contains("is-closing")) return;
  lightboxImage.src = preview.src;
  lightboxImage.alt = source.alt;
  lightboxCaption.textContent = caption;
  lightboxCount.textContent = (currentLightboxIndex + 1) + " / " + visibleGalleryItems.length;
  lightbox.removeAttribute("aria-busy");
  photoAnimation = play(lightboxFigure, [
    { opacity: .35, transform: "translateX(" + direction * 16 + "px)" },
    { opacity: 1, transform: "translateX(0)" },
  ], { duration: 420 });
};

const closeLightbox = async () => {
  if (!lightbox?.open || lightbox.classList.contains("is-closing")) return;
  photoRequest++;
  photoAnimation?.cancel();
  lightbox.classList.add("is-closing");
  const animation = play(lightboxFigure, [{ opacity: 1, scale: "1" }, { opacity: 0, scale: ".98" }], { duration: 180 });
  await finished(animation);
  if (lightbox.open) lightbox.close();
};
const openLightbox = (item) => {
  if (!lightbox || lightbox.open) return;
  lastLightboxTrigger = item;
  lightbox.classList.remove("is-closing");
  lightbox.showModal();
  document.body.classList.add("lightbox-open");
  setLightboxContent(visibleGalleryItems.indexOf(item));
  lightboxClose?.focus({ preventScroll: true });
};

let selectedRegion;
let filterRequest = 0;
let gridAnimation;
const applyGalleryFilter = async (filter, { updateUrl = true, animate = true } = {}) => {
  const selectedButton = filterButtons.find((button) => button.dataset.filter === filter) || filterButtons[0];
  if (!selectedButton || selectedRegion === selectedButton.dataset.filter) return;
  const request = ++filterRequest;
  selectedRegion = selectedButton.dataset.filter;
  filterButtons.forEach((button) => button.setAttribute("aria-pressed", String(button === selectedButton)));
  if (updateUrl) {
    const url = new URL(location.href);
    if (selectedRegion === "all") url.searchParams.delete("region");
    else url.searchParams.set("region", selectedRegion);
    history.pushState(null, "", url);
  }
  gridAnimation?.cancel();
  galleryGrid?.setAttribute("aria-busy", "true");
  if (animate) {
    gridAnimation = play(galleryGrid, [{ opacity: 1 }, { opacity: 0 }], { duration: 120 });
    await finished(gridAnimation);
  }
  if (request !== filterRequest) return;
  galleryItems.forEach((item) => { item.hidden = selectedRegion !== "all" && item.dataset.category !== selectedRegion; });
  visibleGalleryItems = galleryItems.filter((item) => !item.hidden);
  if (galleryStatus) {
    const label = selectedRegion === "all" ? "All destinations" : selectedButton.textContent.trim();
    galleryStatus.textContent = label + " · " + visibleGalleryItems.length + " photos";
  }
  galleryGrid?.removeAttribute("aria-busy");
  if (animate) {
    visibleGalleryItems.forEach((item, index) => {
      item.classList.add("is-visible");
      play(item, [{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "translateY(0)" }],
        { duration: 500, delay: Math.min(index, 5) * 45 });
    });
  }
};
filterButtons.forEach((button) => button.addEventListener("click", () => applyGalleryFilter(button.dataset.filter)));
galleryItems.forEach((item) => item.addEventListener("click", () => openLightbox(item)));
lightboxClose?.addEventListener("click", closeLightbox);
document.querySelector("[data-lightbox-previous]")?.addEventListener("click", () => setLightboxContent(currentLightboxIndex - 1, -1));
document.querySelector("[data-lightbox-next]")?.addEventListener("click", () => setLightboxContent(currentLightboxIndex + 1));
lightbox?.addEventListener("cancel", (event) => { event.preventDefault(); closeLightbox(); });
lightbox?.addEventListener("click", (event) => {
  if (event.target === lightbox || event.target === lightboxPanel) closeLightbox();
});
lightbox?.addEventListener("close", () => {
  photoRequest++;
  document.body.classList.remove("lightbox-open");
  lightbox.classList.remove("is-closing");
  lightbox.removeAttribute("aria-busy");
  lastLightboxTrigger?.focus({ preventScroll: true });
});
document.addEventListener("keydown", (event) => {
  if (!lightbox?.open || lightbox.classList.contains("is-closing")) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeLightbox();
    return;
  }
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    setLightboxContent(currentLightboxIndex + direction, direction);
  }
});
let swipeStart;
lightboxImage?.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "touch") swipeStart = { x: event.clientX, y: event.clientY };
});
lightboxImage?.addEventListener("pointerup", (event) => {
  if (!swipeStart) return;
  const dx = event.clientX - swipeStart.x;
  const dy = event.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.abs(dx) > 50 && Math.abs(dy) < 60) setLightboxContent(currentLightboxIndex + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
});
lightboxImage?.addEventListener("pointercancel", () => { swipeStart = null; });
if (filterButtons.length) {
  applyGalleryFilter(new URLSearchParams(location.search).get("region") || "all", { updateUrl: false, animate: false });
  window.addEventListener("popstate", () => {
    applyGalleryFilter(new URLSearchParams(location.search).get("region") || "all", { updateUrl: false });
  });
}

// Retain Web3Forms for a real key; otherwise the planner copies locally.
// A copy confirmation must never be presented as a sent enquiry.
const inquiryForm = document.querySelector("[data-inquiry-form]");
const inquiryFields = [...document.querySelectorAll("[data-validate]")];
const submitButton = document.querySelector("[data-submit-button]");
const submitLabel = document.querySelector("[data-submit-label]");
const formStatus = document.querySelector("[data-form-status]");
const accessKey = inquiryForm?.elements.namedItem("access_key")?.value.trim();
const formIsConfigured = Boolean(accessKey && !/YOUR_|TODO|PLACEHOLDER/i.test(accessKey));
const idleSubmitText = formIsConfigured ? "Send inquiry" : "Copy my trip details";
if (formIsConfigured) {
  document.querySelector("#form-notice").textContent = "Tell us a little about your plans. Fields marked * are required; other details can be worked out together.";
  document.querySelector(".consent-text").textContent = "By sending, you agree that Seven Continents Travel & Tours may contact you about your inquiry.";
}
if (submitLabel) submitLabel.textContent = idleSubmitText;

const setFieldError = (field, message) => {
  const error = document.querySelector('[data-error-for="' + field.id + '"]');
  field.setAttribute("aria-invalid", String(Boolean(message)));
  if (!error) return;
  error.textContent = message;
  error.classList.toggle("is-visible", Boolean(message));
};
const getFieldError = (field) => {
  const label = field.labels?.[0]?.textContent.replace(/\*|\(optional\)/g, "").trim() || "This field";
  if (field.required && !field.value.trim()) return label + " is required.";
  if (field.validity.typeMismatch) return "Enter a valid email address.";
  if (field.validity.rangeUnderflow) return label + " must be at least " + field.min + ".";
  if (!field.validity.valid) return "Please check " + label.toLowerCase() + ".";
  if (field.type === "tel" && field.value.trim()) {
    const digits = field.value.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) return "Enter a phone number with 7–15 digits, including the country code if needed.";
  }
  return "";
};
const validateField = (field) => {
  const message = getFieldError(field);
  setFieldError(field, message);
  return !message;
};
const setFormStatus = (type, message) => {
  if (!formStatus) return;
  formStatus.className = "form-status" + (message ? " is-visible is-" + type : "");
  formStatus.textContent = message;
};
inquiryFields.forEach((field) => {
  field.addEventListener("blur", () => {
    if (field.value || field.getAttribute("aria-invalid") === "true") validateField(field);
  });
  field.addEventListener("input", () => {
    if (field.getAttribute("aria-invalid") === "true") validateField(field);
  });
});
document.querySelectorAll("[data-service]").forEach((link) => {
  link.addEventListener("click", () => {
    const selected = inquiryForm?.elements.namedItem("service");
    if (selected) selected.value = link.dataset.service;
    const status = document.querySelector("[data-service-status]");
    if (status) {
      status.hidden = false;
      status.textContent = "Interested in: " + link.dataset.service;
    }
  });
});

inquiryForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitButton.disabled) return;
  setFormStatus("", "");
  const valid = inquiryFields.map(validateField).every(Boolean);
  if (!valid) {
    inquiryFields.find((field) => field.getAttribute("aria-invalid") === "true")?.focus();
    return;
  }
  if (inquiryForm.elements.namedItem("botcheck")?.checked) return;
  submitButton.disabled = true;
  submitButton.setAttribute("aria-busy", "true");
  submitLabel.textContent = formIsConfigured ? "Sending…" : "Copying…";
  let requestTimeout;
  try {
    if (!formIsConfigured) {
      const details = new FormData(inquiryForm);
      const summary = [
        "Travel enquiry — Seven Continents Travel & Tours",
        "Name: " + details.get("name"),
        "Email: " + details.get("email"),
        "Mobile: " + (details.get("mobile_number") || "Not provided"),
        "Service: " + (details.get("service") || "Trip planning"),
        "Destination: " + details.get("destination"),
        "Preferred travel dates: " + (details.get("preferred_travel_dates") || "Flexible / to discuss"),
        "Number of travelers: " + (details.get("number_of_travelers") || "To discuss"),
        "", details.get("message"),
      ].join("\n");
      let copied = false;
      try {
        await navigator.clipboard.writeText(summary);
        copied = true;
      } catch {
        let fallback = inquiryForm.querySelector(".copy-fallback");
        if (!fallback) {
          fallback = document.createElement("textarea");
          fallback.className = "copy-fallback";
          fallback.readOnly = true;
          fallback.setAttribute("aria-label", "Trip details to copy and share with our team");
          inquiryForm.append(fallback);
        }
        fallback.value = summary;
        fallback.focus();
        fallback.select();
      }
      setFormStatus("success", copied
        ? "Trip details copied. Paste them into your Facebook conversation with us. Your enquiry has not been sent."
        : "Your trip details are ready below. Select and copy the text, then share it with us on Facebook. Your enquiry has not been sent.");
      return;
    }
    const controller = new AbortController();
    requestTimeout = window.setTimeout(() => controller.abort(), 15000);
    const response = await fetch(inquiryForm.action, {
      method: "POST", body: new FormData(inquiryForm), headers: { Accept: "application/json" }, signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok || result.success !== true) throw new Error("Submission not confirmed");
    inquiryForm.reset();
    inquiryFields.forEach((field) => setFieldError(field, ""));
    const serviceStatus = document.querySelector("[data-service-status]");
    if (serviceStatus) serviceStatus.hidden = true;
    setFormStatus("success", "Thank you. Your inquiry has been sent to our team.");
  } catch {
    setFormStatus("error", "We couldn’t send your inquiry. Your details are still here. Please call 02 8364 3904 or contact us on Facebook.");
  } finally {
    clearTimeout(requestTimeout);
    submitButton.disabled = false;
    submitButton.removeAttribute("aria-busy");
    submitLabel.textContent = idleSubmitText;
    if (!inquiryForm.querySelector(".copy-fallback")) formStatus?.focus({ preventScroll: true });
  }
});
if (submitButton) submitButton.type = "submit";
window.addEventListener("pageshow", () => setNavigation(false));
