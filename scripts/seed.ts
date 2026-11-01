/**
 * Demo studio seed data.
 *
 * Usage:
 *   npm run seed          # inserts only when the studios collection is empty
 *   npm run seed -- --force  # wipes demo collections and re-seeds
 *
 * The seeded host profile is placeholder content (not a login account):
 * real accounts are only created through registration / Google OAuth.
 * Image URLs are stored as root-relative paths ("/images/studios/…") that
 * resolve against whatever origin serves the web app — a hard-coded
 * http://localhost:3000 prefix would break every card in production.
 */
import { connectDatabase, closeDatabase, getDatabase } from "../src/config/database";
import { ensureIndexes } from "../src/config/indexes";

/** Public folder of the Next.js app — same path locally and in production. */
const IMAGE_BASE = "/images/studios";

interface SeedStudio {
  slug: string;
  title: string;
  category: string;
  description: string;
  hourlyRate: number;
  securityDeposit: number;
  maxCapacity: number;
  address: string;
  city: string;
  image: string;
  gallery: string[];
  amenities: string[];
  equipment: string[];
  rating: number;
  reviewCount: number;
}

const HOST = {
  ownerId: "seeded-demo-host",
  ownerEmail: "host@studiospace.demo",
  ownerName: "StudioSpace Demo Host",
};

const STUDIOS: SeedStudio[] = [
  {
    slug: "luminous-daylight-photo-studio",
    title: "Luminous Daylight Photo Studio",
    category: "Photo Studio",
    description:
      "A 900 sq ft daylight photo studio with a white cyclorama wall, blackout curtains and a full grip package. Natural light floods the space from the north-facing windows, making it a favourite for fashion editorials and product shoots.",
    hourlyRate: 45,
    securityDeposit: 100,
    maxCapacity: 12,
    address: "House 41, Road 11, Banani",
    city: "Dhaka",
    image: "photo-studio.jpg",
    gallery: ["photo-studio.jpg", "creative-workspace.jpg"],
    amenities: ["Wi-Fi", "Air Conditioning", "Blackout Curtains", "Makeup Station"],
    equipment: ["Cyc Wall", "Softboxes", "C-Stands", "Reflector"],
    rating: 4.8,
    reviewCount: 3,
  },
  {
    slug: "sound-stage-one",
    title: "Sound Stage One",
    category: "Sound Stage",
    description:
      "A convertible sound stage with 6 m ceiling height, grid rigging and sound-treated walls. Suitable for short films, commercials and branded content productions needing controlled lighting and clean audio.",
    hourlyRate: 85,
    securityDeposit: 300,
    maxCapacity: 30,
    address: "Plot 7, Sector 4, Bashundhara R/A",
    city: "Dhaka",
    image: "sound-stage.jpg",
    gallery: ["sound-stage.jpg", "production-space.jpg"],
    amenities: ["Wi-Fi", "Air Conditioning", "Green Room", "Loading Dock"],
    equipment: ["Lighting Grid", "Dolly Track", "Green Screen", "Monitors"],
    rating: 4.9,
    reviewCount: 3,
  },
  {
    slug: "the-quiet-room-podcast-suite",
    title: "The Quiet Room Podcast Suite",
    category: "Podcast Room",
    description:
      "A fully acoustically treated podcast room with four broadcast microphones, an audio interface and a live mixer. Walk in, sit down and record — everything is patched and ready.",
    hourlyRate: 25,
    securityDeposit: 50,
    maxCapacity: 5,
    address: "Level 3, GEC Circle",
    city: "Chattogram",
    image: "podcast-room.jpg",
    gallery: ["podcast-room.jpg"],
    amenities: ["Wi-Fi", "Air Conditioning", "Acoustic Treatment", "Refreshments"],
    equipment: ["4x Broadcast Mics", "Audio Interface", "Mixer", "Headphone Mix"],
    rating: 4.7,
    reviewCount: 3,
  },
  {
    slug: "harmony-recording-suite",
    title: "Harmony Recording Suite",
    category: "Music Suite",
    description:
      "A warm recording suite with an isolated vocal booth, near-field monitors and an analogue-modelled signal chain. Perfect for vocals, overdubs, podcasts and small ensemble sessions.",
    hourlyRate: 40,
    securityDeposit: 120,
    maxCapacity: 8,
    address: "22 Zindabazar Main Road",
    city: "Sylhet",
    image: "music-suite.jpg",
    gallery: ["music-suite.jpg", "podcast-room.jpg"],
    amenities: ["Wi-Fi", "Air Conditioning", "Vocal Booth", "Lounge Corner"],
    equipment: ["Condenser Mic", "Studio Monitors", "MIDI Keyboard", "Headphones"],
    rating: 4.6,
    reviewCount: 3,
  },
  {
    slug: "terracotta-art-workshop",
    title: "Terracotta Art Workshop",
    category: "Art Workshop",
    description:
      "A light-filled workshop studio with long communal tables, sink access and wall space for pinning work in progress. Built for painting classes, ceramics sessions and collaborative art residencies.",
    hourlyRate: 20,
    securityDeposit: 40,
    maxCapacity: 16,
    address: "Road 5, Dhanmondi",
    city: "Dhaka",
    image: "art-workshop.jpg",
    gallery: ["art-workshop.jpg", "creative-workspace.jpg"],
    amenities: ["Wi-Fi", "Natural Light", "Sink Access", "Storage Lockers"],
    equipment: ["Easels", "Clay Wheels", "Drying Racks", "Projector"],
    rating: 4.5,
    reviewCount: 3,
  },
  {
    slug: "atelier-creative-workspace",
    title: "Atelier Creative Workspace",
    category: "Creative Workspace",
    description:
      "A calm, minimally furnished creative workspace with standing desks, a reading nook and strong coffee. Ideal for content planners, designers and small crews planning their next production.",
    hourlyRate: 15,
    securityDeposit: 30,
    maxCapacity: 10,
    address: "9 O R Nandipara Road",
    city: "Khulna",
    image: "creative-workspace.jpg",
    gallery: ["creative-workspace.jpg", "art-workshop.jpg"],
    amenities: ["Wi-Fi", "Air Conditioning", "Coffee Station", "Printing"],
    equipment: ["Standing Desks", "Whiteboard", "4K Monitor", "Webcams"],
    rating: 4.4,
    reviewCount: 3,
  },
  {
    slug: "gold-hour-photo-loft",
    title: "Gold Hour Photo Loft",
    category: "Photo Studio",
    description:
      "A brick-walled loft studio with golden-hour light, seamless paper rolls and a lounge set for lifestyle shoots. Includes a private changing area and tethering station.",
    hourlyRate: 55,
    securityDeposit: 150,
    maxCapacity: 14,
    address: "House 18, Road 7, Gulshan 1",
    city: "Dhaka",
    image: "photo-studio.jpg",
    gallery: ["photo-studio.jpg", "sound-stage.jpg"],
    amenities: ["Wi-Fi", "Air Conditioning", "Changing Room", "Tethering Station"],
    equipment: ["Seamless Rolls", "Beauty Dish", "Speedlights", "Apple Boxes"],
    rating: 4.9,
    reviewCount: 3,
  },
  {
    slug: "independent-film-stage",
    title: "Independent Film Stage",
    category: "Production Space",
    description:
      "A practical production space with a cove corner, painted flats and on-site prop storage. Frequently used for indie film scenes, interview setups and product films.",
    hourlyRate: 70,
    securityDeposit: 250,
    maxCapacity: 25,
    address: "South Gazipur Industrial Area",
    city: "Gazipur",
    image: "production-space.jpg",
    gallery: ["production-space.jpg", "sound-stage.jpg"],
    amenities: ["Wi-Fi", "Parking", "Prop Storage", "Power Distribution"],
    equipment: ["Painted Flats", "Cove Corner", "Sandbags", "Generator Backup"],
    rating: 4.6,
    reviewCount: 3,
  },
  {
    slug: "riverine-podcast-nook",
    title: "Riverine Podcast Nook",
    category: "Podcast Room",
    description:
      "A cosy two-seat podcast nook with wood panelling, dynamic microphones and a streaming PC preloaded with your recording software. Great for interview shows and remote guests.",
    hourlyRate: 18,
    securityDeposit: 35,
    maxCapacity: 3,
    address: "Shahjalal Upashahar, Level 2",
    city: "Sylhet",
    image: "podcast-room.jpg",
    gallery: ["podcast-room.jpg", "music-suite.jpg"],
    amenities: ["Wi-Fi", "Air Conditioning", "Acoustic Treatment"],
    equipment: ["2x Dynamic Mics", "Streaming PC", "Stream Deck", "Headphones"],
    rating: 4.3,
    reviewCount: 3,
  },
  {
    slug: "riverside-music-room",
    title: "Riverside Music Room",
    category: "Music Suite",
    description:
      "A rehearsal-friendly music room with drum kit, guitar amps and bass cab, tuned and maintained weekly. Book by the hour for band rehearsals, tracking and songwriting camps.",
    hourlyRate: 30,
    securityDeposit: 80,
    maxCapacity: 7,
    address: "32 KCC Circular Road",
    city: "Cumilla",
    image: "music-suite.jpg",
    gallery: ["music-suite.jpg", "sound-stage.jpg"],
    amenities: ["Wi-Fi", "Soundproofing", "Water Cooler", "Instrument Storage"],
    equipment: ["Drum Kit", "Guitar Amps", "Bass Cab", "PA Speakers"],
    rating: 4.5,
    reviewCount: 3,
  },
  {
    slug: "clay-and-kiln-workshop",
    title: "Clay & Kiln Workshop",
    category: "Art Workshop",
    description:
      "A ceramics-friendly workshop with two kilns, wedging tables and plenty of natural light. Host pottery classes, glaze sessions or weekend maker pop-ups here.",
    hourlyRate: 22,
    securityDeposit: 60,
    maxCapacity: 12,
    address: "Jail Road, Ward 4",
    city: "Bogura",
    image: "art-workshop.jpg",
    gallery: ["art-workshop.jpg"],
    amenities: ["Natural Light", "Sink Access", "Kiln Access", "Aprons"],
    equipment: ["2x Kilns", "Wedges Tables", "Rolling Pins", "Glaze Buckets"],
    rating: 4.4,
    reviewCount: 3,
  },
  {
    slug: "minimal-creative-studio",
    title: "Minimal Creative Studio",
    category: "Creative Workspace",
    description:
      "An ivory-toned studio with editorial styling corners, a flat-lay table and neutral backdrops — designed for content creators shooting lookbooks, reels and still-life stories.",
    hourlyRate: 28,
    securityDeposit: 70,
    maxCapacity: 9,
    address: "Bangabandhu Road, Town Centre",
    city: "Narayanganj",
    image: "creative-workspace.jpg",
    gallery: ["creative-workspace.jpg", "photo-studio.jpg"],
    amenities: ["Wi-Fi", "Air Conditioning", "Flat-lay Table", "Steamer"],
    equipment: ["Neutral Backdrops", "Flat-lay Board", "Prop Library", "Ring Light"],
    rating: 4.7,
    reviewCount: 3,
  },
];

const DEMO_REVIEWS = [
  { user: "demo-reviewer-a", name: "Ayesha K.", rating: 5, comment: "Exactly as pictured — the host was welcoming and the space was spotless." },
  { user: "demo-reviewer-b", name: "Rafi H.", rating: 5, comment: "Smooth check-in and great natural light. We booked extra hours on the spot." },
  { user: "demo-reviewer-c", name: "Tasmia R.", rating: 4, comment: "Solid equipment and quiet neighbours. Would happily shoot here again." },
];

async function seed(): Promise<void> {
  const force = process.argv.includes("--force");
  const db = await connectDatabase();
  await ensureIndexes(db);

  const studios = db.collection("studios");
  const existing = await studios.countDocuments();

  if (existing > 0 && !force) {
    console.log(`Studios collection already has ${existing} documents — nothing to do (use --force to re-seed).`);
    return;
  }

  if (force) {
    await Promise.all([
      studios.deleteMany({}),
      db.collection("bookings").deleteMany({}),
      db.collection("booking_slots").deleteMany({}),
      db.collection("wishlist").deleteMany({}),
      db.collection("reviews").deleteMany({}),
    ]);
    console.log("Cleared studios, bookings, slots, wishlist and reviews.");
  }

  const now = new Date();
  const studioDocs = STUDIOS.map((seed, index) => {
    const createdAt = new Date(now.getTime() - (index + 1) * 86_400_000);
    return {
      title: seed.title,
      category: seed.category,
      description: seed.description,
      hourlyRate: seed.hourlyRate,
      securityDeposit: seed.securityDeposit,
      maxCapacity: seed.maxCapacity,
      location: { address: seed.address, city: seed.city },
      imageUrl: `${IMAGE_BASE}/${seed.image}`,
      gallery: seed.gallery.map((name) => `${IMAGE_BASE}/${name}`),
      amenities: seed.amenities,
      equipment: seed.equipment,
      ...HOST,
      rating: seed.rating,
      reviewCount: seed.reviewCount,
      createdAt,
      updatedAt: createdAt,
      _seedSlug: seed.slug,
    };
  });

  const inserted = await studios.insertMany(studioDocs);
  // `insertMany` resolves to { insertedCount, insertedIds } — not documents.
  const insertedIds = Object.values(inserted.insertedIds);

  const reviewDocs = insertedIds.map((studioId, studioIndex) =>
    DEMO_REVIEWS.map((review, reviewIndex) => ({
      studioId: studioId.toHexString(),
      userId: `demo-reviewer-${studioIndex}-${review.user}`,
      userName: review.name,
      rating: reviewIndex === 2 && studioIndex % 3 === 1 ? 4 : review.rating,
      comment: review.comment,
      createdAt: new Date(now.getTime() - (studioIndex + 1) * 43_200_000),
      updatedAt: new Date(now.getTime() - (studioIndex + 1) * 43_200_000),
    }))
  ).flat();

  await db.collection("reviews").insertMany(reviewDocs);

  console.log(`Seeded ${insertedIds.length} studios and ${reviewDocs.length} demo reviews.`);
  console.log(`Image base path: ${IMAGE_BASE}/`);
}

seed()
  .then(() => closeDatabase())
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
