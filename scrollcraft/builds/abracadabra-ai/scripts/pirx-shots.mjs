/** Self-hosted pirx.ca screenshots. Alt text describes the screen. It does not repeat PIRX's own marketing claims. */

function shot(file, alt, width, height) {
  return { src: `/assets/pirx/${file}`, alt, width, height };
}

function pair(desktop, mobile) {
  return { desktop, mobile };
}

export const pirxHero = pair(
  shot(
    "pirx-home-hero-desktop.jpg",
    "pirx.ca home page, with a race time predictor: recent race, goal race, and race date.",
    1440,
    900,
  ),
  shot(
    "pirx-home-hero-mobile.jpg",
    "pirx.ca home page on a phone, with a race time predictor: recent race, goal race, and race date.",
    780,
    1688,
  ),
);

export const pirxHomeFull = pair(
  shot(
    "pirx-home-full-desktop.jpg",
    "pirx.ca home page on a desktop browser, scrolled past the hero to the predictor, a sample result, and the running guides.",
    1440,
    5000,
  ),
  shot(
    "pirx-home-full-mobile.jpg",
    "pirx.ca home page on a phone, scrolled past the hero to the predictor, a sample result, and the running guides.",
    780,
    5000,
  ),
);

export const pirxBlogPost = pair(
  shot(
    "pirx-blog-post-full-desktop.jpg",
    "A pirx.ca guide, Good 10K time by age, open on a desktop browser.",
    1440,
    5000,
  ),
  shot(
    "pirx-blog-post-full-mobile.jpg",
    "A pirx.ca guide, Good 10K time by age, open on a phone.",
    780,
    5000,
  ),
);

export const pirxRacePredictor = pair(
  shot(
    "pirx-race-predictor-full-desktop.jpg",
    "The pirx.ca race time predictor on a desktop browser, with a recent race, a goal race, and a sample prediction.",
    1440,
    2177,
  ),
  shot(
    "pirx-race-predictor-full-mobile.jpg",
    "The pirx.ca race time predictor on a phone, with a recent race, a goal race, and a sample prediction.",
    780,
    5000,
  ),
);

export const pirxMarathon = pair(
  shot(
    "pirx-race-predictor-marathon-full-desktop.jpg",
    "The pirx.ca marathon time predictor on a desktop browser, with a recent race, a goal marathon, and a sample prediction.",
    1440,
    4007,
  ),
  shot(
    "pirx-race-predictor-marathon-full-mobile.jpg",
    "The pirx.ca marathon time predictor on a phone, with a recent race, a goal marathon, and a sample prediction.",
    780,
    5000,
  ),
);

export const pirxAccuracy = pair(
  shot(
    "pirx-accuracy-full-desktop.jpg",
    "The pirx.ca accuracy page on a desktop browser, showing how predicted times are checked against race results.",
    1440,
    2851,
  ),
  shot(
    "pirx-accuracy-full-mobile.jpg",
    "The pirx.ca accuracy page on a phone, showing how predicted times are checked against race results.",
    780,
    5000,
  ),
);

export const pirxBlogIndex = pair(
  shot(
    "pirx-blog-full-desktop.jpg",
    "The pirx.ca blog index on a desktop browser, a list of running guides.",
    1440,
    5000,
  ),
  shot(
    "pirx-blog-full-mobile.jpg",
    "The pirx.ca blog index on a phone, a list of running guides.",
    780,
    5000,
  ),
);

export const pirxCustomAppShots = [pirxRacePredictor];
export const pirxVisibilityShots = [pirxAccuracy, pirxMarathon, pirxBlogIndex];
export const pirxCaseShots = [pirxHomeFull, pirxBlogPost];
