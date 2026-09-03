// Realistic fixture data for MockSilpoMcpClient, modeled after the real
// category tree documented in docs/silpo-mcp-audit (napoi-52, kava-chai-359,
// molochni-produkty-ta-iaitsia-234, sneky-ta-chypsy-5016, dlia-domu-567).
// Product ids/prices/stock are invented but plausible for a Kyiv branch.

export const BRANCH_ID = 'branch-kyiv-podil-0142';
export const COMPANY_ID = 'silpo-retail-ua';

export const CATEGORIES_TREE = [
  { slug: 'frukty-ovochi-19', title: 'Фрукти та овочі', children: [
    { slug: 'frukty-19-1', title: 'Фрукти' }
  ]},
  { slug: 'napoi-52', title: 'Напої', children: [
    { slug: 'voda-52-1', title: 'Вода' },
    { slug: 'soky-52-2', title: 'Соки та нектари' }
  ]},
  { slug: 'kava-chai-359', title: 'Кава, чай і какао', children: [
    { slug: 'kava-359-1', title: 'Кава' },
    { slug: 'chai-359-2', title: 'Чай' }
  ]},
  { slug: 'molochni-produkty-ta-iaitsia-234', title: 'Молочні продукти та яйця', children: [
    { slug: 'moloko-234-1', title: 'Молоко' }
  ]},
  { slug: 'sneky-ta-chypsy-5016', title: 'Снеки та чипси', children: [] },
  { slug: 'dlia-domu-567', title: 'Для дому', children: [
    { slug: 'paperovi-vyroby-567-1', title: 'Паперові вироби' },
    { slug: 'zasoby-gigieny-567-2', title: 'Засоби гігієни' },
    { slug: 'batareiky-567-3', title: 'Батарейки' },
    { slug: 'osvitlennia-567-4', title: 'Освітлення' },
    { slug: 'svichky-567-5', title: 'Свічки' },
    { slug: 'elektryka-567-6', title: 'Електрика' }
  ]}
];

// Product catalog keyed loosely by search term / category so the mock
// client can do naive substring matching, similar to how find_products_batch
// resolves free-text terms to SKUs.
export const PRODUCTS = [
  {
    id: 'p-fruit-apples-1kg', slug: 'yabluka-golden-1kg', name: 'Яблука Golden 1кг',
    category: 'frukty-19-1', price: 39.9, oldPrice: null, inStock: true, stockQty: 300,
    onPromotion: false, unit: 'кг', companyId: COMPANY_ID, branchId: BRANCH_ID
  },
  {
    id: 'p-fruit-bananas-1kg', slug: 'banany-1kg', name: 'Банани 1кг',
    category: 'frukty-19-1', price: 44.9, oldPrice: 49.9, inStock: true, stockQty: 200,
    onPromotion: true, unit: 'кг', companyId: COMPANY_ID, branchId: BRANCH_ID
  },
  {
    id: 'p-water-still-6l', slug: 'voda-morshynska-negazovana-6l', name: 'Вода Моршинська негазована 6л',
    category: 'voda-52-1', price: 89.9, oldPrice: 99.9, inStock: true, stockQty: 240,
    onPromotion: true, unit: 'пляшка', companyId: COMPANY_ID, branchId: BRANCH_ID
  },
  {
    id: 'p-water-sparkling-1_5l', slug: 'voda-morshynska-gazovana-1-5l', name: 'Вода Моршинська газована 1.5л',
    category: 'voda-52-1', price: 24.5, oldPrice: null, inStock: true, stockQty: 500,
    onPromotion: false, unit: 'пляшка', companyId: COMPANY_ID, branchId: BRANCH_ID
  },
  {
    id: 'p-coffee-beans-1kg', slug: 'kava-lavazza-qualita-rossa-1kg', name: 'Кава в зернах Lavazza Qualita Rossa 1кг',
    category: 'kava-359-1', price: 549.0, oldPrice: 619.0, inStock: true, stockQty: 40,
    onPromotion: true, unit: 'пач', companyId: COMPANY_ID, branchId: BRANCH_ID
  },
  {
    id: 'p-coffee-instant-200g', slug: 'kava-jacobs-monarch-200g', name: 'Кава розчинна Jacobs Monarch 200г',
    category: 'kava-359-1', price: 219.0, oldPrice: null, inStock: true, stockQty: 90,
    onPromotion: false, unit: 'банка', companyId: COMPANY_ID, branchId: BRANCH_ID
  },
  {
    id: 'p-tea-black-100', slug: 'chai-chorny-ahmad-tea-100pak', name: 'Чай чорний Ahmad Tea 100 пакетиків',
    category: 'chai-359-2', price: 159.0, oldPrice: 179.0, inStock: true, stockQty: 70,
    onPromotion: true, unit: 'пач', companyId: COMPANY_ID, branchId: BRANCH_ID
  },
  {
    id: 'p-milk-2_5-1l', slug: 'moloko-yagotynske-2-5-1l', name: 'Молоко Яготинське 2.5% 1л',
    category: 'moloko-234-1', price: 44.9, oldPrice: null, inStock: true, stockQty: 150,
    onPromotion: false, unit: 'пакет', companyId: COMPANY_ID, branchId: BRANCH_ID
  },
  {
    id: 'p-milk-oat-1l', slug: 'moloko-vivsyane-oatly-1l', name: 'Молоко вівсяне Oatly 1л',
    category: 'moloko-234-1', price: 129.0, oldPrice: 145.0, inStock: true, stockQty: 25,
    onPromotion: true, unit: 'пакет', companyId: COMPANY_ID, branchId: BRANCH_ID
  },
  {
    id: 'p-snacks-nuts-200g', slug: 'snek-mix-horihiv-200g', name: 'Мікс горіхів солоних 200г',
    category: 'sneky-ta-chypsy-5016', price: 99.0, oldPrice: null, inStock: true, stockQty: 60,
    onPromotion: false, unit: 'пач', companyId: COMPANY_ID, branchId: BRANCH_ID
  },
  {
    id: 'p-snacks-cookies-300g', slug: 'pechyvo-oreo-300g', name: 'Печиво Oreo 300г',
    category: 'sneky-ta-chypsy-5016', price: 79.0, oldPrice: 89.0, inStock: true, stockQty: 120,
    onPromotion: true, unit: 'пач', companyId: COMPANY_ID, branchId: BRANCH_ID
  },
  {
    id: 'p-paper-towels-2pk', slug: 'paperovi-rushnyky-focus-2rul', name: 'Паперові рушники Focus 2 рулони',
    category: 'paperovi-vyroby-567-1', price: 79.9, oldPrice: null, inStock: true, stockQty: 80,
    onPromotion: false, unit: 'уп', companyId: COMPANY_ID, branchId: BRANCH_ID
  },
  {
    id: 'p-toilet-paper-8pk', slug: 'tualetny-papir-zewa-8rul', name: 'Туалетний папір Zewa 8 рулонів',
    category: 'paperovi-vyroby-567-1', price: 149.0, oldPrice: 169.0, inStock: true, stockQty: 55,
    onPromotion: true, unit: 'уп', companyId: COMPANY_ID, branchId: BRANCH_ID
  },
  {
    id: 'p-hand-soap-500ml', slug: 'midke-rido-500ml', name: 'Рідке мило для рук 500мл',
    category: 'zasoby-gigieny-567-2', price: 69.0, oldPrice: null, inStock: true, stockQty: 100,
    onPromotion: false, unit: 'флакон', companyId: COMPANY_ID, branchId: BRANCH_ID
  },
  // ---- Emergency-readiness products — modeled on real Silpo search-term
  // hits confirmed live via silpo_find_products_batch (батарейки, ліхтарик
  // LED, свічки, подовжувач — see docs/b2b-mvp/ROADMAP.md). Deliberately no
  // power-bank/generator SKUs — confirmed not carried by Silpo.
  {
    id: 'p-batt-aa-duracell-4pk', slug: 'batareiky-duracell-aa-4sht', name: 'Батарейки Duracell AA 4шт',
    category: 'batareiky-567-3', price: 129.0, oldPrice: 149.0, inStock: true, stockQty: 200,
    onPromotion: true, unit: 'уп', companyId: COMPANY_ID, branchId: BRANCH_ID
  },
  {
    id: 'p-batt-aaa-varta-4pk', slug: 'batareiky-varta-aaa-4sht', name: 'Батарейки Varta AAA 4шт',
    category: 'batareiky-567-3', price: 119.0, oldPrice: null, inStock: true, stockQty: 180,
    onPromotion: false, unit: 'уп', companyId: COMPANY_ID, branchId: BRANCH_ID
  },
  {
    id: 'p-led-flashlight-videx', slug: 'lihtaryk-led-videx', name: 'Ліхтарик LED Videx VLF-A035',
    category: 'osvitlennia-567-4', price: 249.0, oldPrice: 289.0, inStock: true, stockQty: 40,
    onPromotion: true, unit: 'шт', companyId: COMPANY_ID, branchId: BRANCH_ID
  },
  {
    id: 'p-led-bulb-enl', slug: 'lampa-led-enl-a60', name: 'Лампа LED ENL A60 10W',
    category: 'osvitlennia-567-4', price: 59.0, oldPrice: null, inStock: true, stockQty: 90,
    onPromotion: false, unit: 'шт', companyId: COMPANY_ID, branchId: BRANCH_ID
  },
  {
    id: 'p-candles-party-6pk', slug: 'svichky-6sht', name: 'Свічки декоративні 6шт',
    category: 'svichky-567-5', price: 45.0, oldPrice: null, inStock: true, stockQty: 150,
    onPromotion: false, unit: 'уп', companyId: COMPANY_ID, branchId: BRANCH_ID
  },
  {
    id: 'p-extension-cord-5socket', slug: 'podovzhuvach-euroelectric-5rozetok', name: 'Фільтр-подовжувач Euroelectric 5 розеток',
    category: 'elektryka-567-6', price: 349.0, oldPrice: 399.0, inStock: true, stockQty: 25,
    onPromotion: true, unit: 'шт', companyId: COMPANY_ID, branchId: BRANCH_ID
  }
];

export const PROMOTIONS = PRODUCTS.filter((p) => p.onPromotion).map((p) => ({
  code: `PROMO-${p.id.toUpperCase()}`,
  productId: p.id,
  slug: p.slug,
  discountFrom: p.oldPrice,
  discountTo: p.price
}));

export const DELIVERY_TYPES = [
  { type: 'DeliveryHome', label: 'Доставка додому', branchId: BRANCH_ID },
  { type: 'B2B', label: 'B2B delivery (business orders)', branchId: BRANCH_ID },
  { type: 'SelfPickup', label: 'Самовивіз', branchId: BRANCH_ID },
  { type: 'NovaPoshta', label: 'Нова Пошта', branchId: BRANCH_ID }
];

export const TIME_SLOTS = [
  { start: '2026-09-03T09:00:00+03:00', end: '2026-09-03T11:00:00+03:00', available: true },
  { start: '2026-09-03T11:00:00+03:00', end: '2026-09-03T13:00:00+03:00', available: true },
  { start: '2026-09-03T14:00:00+03:00', end: '2026-09-03T16:00:00+03:00', available: false }
];
