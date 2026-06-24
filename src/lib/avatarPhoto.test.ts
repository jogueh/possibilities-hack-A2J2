import { describe, it, expect } from "vitest";
import { photoUrlForUser, genderForName } from "./avatarPhoto";

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

  it("matches portrait gender to the member's name when provided", () => {
    expect(photoUrlForUser("user_1003", "James Smith")).toContain("/men/");
    expect(photoUrlForUser("user_1003", "Mary Smith")).toContain("/women/");
  });

  it("keeps the portrait index stable regardless of name-derived gender", () => {
    const male = photoUrlForUser("user_1003", "James Smith").match(URL_RE)!;
    const female = photoUrlForUser("user_1003", "Mary Smith").match(URL_RE)!;
    // Same id ⇒ same index; only the gallery flips with the name.
    expect(male[2]).toBe(female[2]);
  });

  it("falls back to the id hash for unknown names", () => {
    expect(photoUrlForUser("user_1227", "Zzyzx Quux")).toBe(
      photoUrlForUser("user_1227"),
    );
  });
});

describe("genderForName", () => {
  it("classifies known male and female first names", () => {
    expect(genderForName("Robert Smith")).toBe("men");
    expect(genderForName("jennifer lopez")).toBe("women");
  });

  it("returns null for unknown or empty names", () => {
    expect(genderForName("Zzyzx Quux")).toBeNull();
    expect(genderForName("")).toBeNull();
    expect(genderForName(undefined)).toBeNull();
  });
});
