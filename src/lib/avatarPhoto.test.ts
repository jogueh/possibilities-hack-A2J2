import { describe, it, expect } from "vitest";
import { photoUrlForUser } from "./avatarPhoto";

const URL_RE = /^https:\/\/randomuser\.me\/api\/portraits\/(men|women)\/(\d{1,2})\.jpg$/;

describe("photoUrlForUser", () => {
  it("returns a well-formed randomuser.me portrait URL", () => {
    const m = photoUrlForUser("user_1003").match(URL_RE);
    expect(m).not.toBeNull();
    expect(Number(m![2])).toBeGreaterThanOrEqual(0);
    expect(Number(m![2])).toBeLessThan(100);
  });

  it("is deterministic — the same id always maps to the same URL", () => {
    expect(photoUrlForUser("user_1227")).toBe(photoUrlForUser("user_1227"));
  });

  it("gives different ids different URLs (in general)", () => {
    const urls = new Set(
      Array.from({ length: 50 }, (_, i) => photoUrlForUser(`user_${1000 + i}`)),
    );
    // Not all 50 collide onto one face.
    expect(urls.size).toBeGreaterThan(10);
  });

  it("spreads across both galleries", () => {
    const genders = new Set(
      Array.from({ length: 100 }, (_, i) =>
        photoUrlForUser(`user_${2000 + i}`).includes("/men/") ? "men" : "women",
      ),
    );
    expect(genders).toEqual(new Set(["men", "women"]));
  });
});
