/**
 * Remote source URLs for product images, keyed by product slug -> color.
 *
 * These URLs are used ONLY by `prisma/download-assets.ts`, which downloads them
 * into `backend/assets/products/<slug>/<color>/{1..3}.jpg`. They are never
 * persisted — the database stores only the local relative paths produced by
 * `product-images.data.ts`. This keeps image serving local (no runtime internet
 * dependency).
 *
 * Each color provides 1-3 URLs; the downloader pads to exactly 3 files by
 * reusing the available URLs when fewer than 3 are supplied.
 */
export type ImageSourceMap = Record<string, Record<string, string[]>>;

export const imageSources: ImageSourceMap = {
  'samsung-galaxy-s25': {
    blue: [
      'https://images.samsung.com/is/image/samsung/p6pim/in/feature/others/in-feature-galaxy-s25-fe-sm-s731-549028343?$550_N_JPG$',
    ],
    violet: [
      'https://cdn.jiostore.online/v2/jmd-asp/jdprod/wrkr/products/pictures/item/free/original/samsung/494493901/0/Wk7UoL7T_u-Jea7mlgBwk-Samsung-Galaxy-S25-494493901-i-1-1200Wx1200H.jpeg',
    ],
  },
  'apple-iphone-16': {
    blue: [
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSH2d_PeYRYAuJkf3n_Vx0uMe6XABblEE6QOA&s',
    ],
    black: [
      'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=1080/da/cms-assets/cms/product/3e2c79af-60af-4dab-962b-3d8b3e8ec3e4.png?bg_token=color.background.quaternary',
    ],
  },
  'google-pixel-9': {
    obsidian: ['https://m.media-amazon.com/images/I/61vPDPr-RzL.jpg'],
    porcelain: [
      'https://cdn.jiostore.online/v2/jmd-asp/jdprod/wrkr/products/pictures/item/free/resize-w:460/google/494422682/14/r7tQU_gJjK-cRrWU4TAK0K-GoogleGoogle-Pixel-9-494422682-i-15-1200Wx1200H.jpeg',
    ],
  },
  'dell-xps-15': {
    silver: [
      'https://i.pcmag.com/imagery/reviews/06jXYH66gbfR1chaGBUrRwI-13.v_1569469985.jpg',
    ],
    white: [
      'https://cdn.neowin.com/news/images/uploaded/2020/04/1585954865_x6.jpg',
    ],
  },
  'apple-macbook-air': {
    midnight: [
      'https://rukmini1.flixcart.com/image/1500/1500/xif0q/computer/a/w/p/-original-imagfdeqqe6kkuxw.jpeg?q=70',
    ],
    starlight: ['https://m.media-amazon.com/images/I/61bsMB7nq7L.jpg'],
  },
  'lenovo-thinkpad-x1-carbon': {
    black: [
      'https://m.media-amazon.com/images/I/41AW34vZZdL._AC_UF1000,1000_QL80_.jpg',
    ],
    silver: [
      'https://m.media-amazon.com/images/I/412FVjQOzrL._AC_UF894,1000_QL80_.jpg',
    ],
  },
  'sony-wh-1000xm5': {
    black: ['https://www.sathya.store/img/product/u34NTDEMJJMfzGZO.webp'],
    silver: [
      'https://img.tatacliq.com/images/i9/437Wx649H/MP000000016239752_437Wx649H_202302071202431.jpeg',
    ],
  },
  'bose-quietcomfort-ultra': {
    black: [
      'https://avstore.in/cdn/shop/files/1.AVStore-Bose-QuietComfort-Ultra-Headphone-Front-View-Black.jpg?v=1709816392',
    ],
    white: [
      'https://avshack.in/cdn/shop/files/bosequietcomfortultra-headphones-diamond01.jpg?v=1733229999&width=1920',
    ],
    blue: [
      'https://rukminim2.flixcart.com/image/480/640/xif0q/headphone/v/8/y/-original-imahfkfksqgmzphk.jpeg?q=90',
    ],
  },
  'apple-airpods-max': {
    'space-gray': [
      'https://static.wixstatic.com/media/a3451a_7f7465666f5c4009a8389e47bf6d5001~mv2.jpg/v1/fit/w_500,h_500,q_90/file.jpg',
    ],
    'sky-blue': [
      'https://m.media-amazon.com/images/I/81jkMpNHVsL._AC_UF1000,1000_QL80_.jpg',
    ],
  },
  'apple-watch-series-10': {
    black: [
      'https://m.media-amazon.com/images/I/61I431q8rhL._AC_UF1000,1000_QL80_.jpg',
    ],
    silver: [
      'https://rukminim2.flixcart.com/image/480/640/xif0q/smartwatch/g/l/g/-original-imah4jndzzuhsajc.jpeg?q=20',
    ],
  },
  'samsung-galaxy-watch-7': {
    green: ['https://m.media-amazon.com/images/I/51Gv-82OkZL.jpg'],
    silver: [
      'https://images.samsung.com/is/image/samsung/p6pim/in/2407/gallery/in-galaxy-watch7-l310-sm-l310nzsains-thumb-542366981',
    ],
  },
  'classic-cotton-t-shirt': {
    red: [
      'https://d2yazi0kor6i6d.cloudfront.net/128571/PIN150764_d536526ef56a4e54e11bbbf151fb73fa.jpg',
    ],
    blue: [
      'https://assets.ajio.com/medias/sys_master/root/20241202/Z5iA/674d775f0f47f80c87c29b4d/-473Wx593H-700843178-blue-MODEL.jpg',
    ],
  },
  'slim-fit-jeans': {
    blue: [
      'https://rukminim2.flixcart.com/image/480/640/xif0q/jean/t/r/6/32-udjeno1574-u-s-polo-assn-denim-co-original-imahfyn7mhgsvg2x.jpeg?q=90',
    ],
  },
  'hooded-sweatshirt': {
    gray: ['https://m.media-amazon.com/images/I/41PoCS7bRjL._AC_.jpg'],
    blue: ['https://m.media-amazon.com/images/I/51i7VzjM2hL._AC_UY1100_.jpg'],
  },
  'floral-summer-dress': {
    red: [
      'https://images.meesho.com/images/products/901552224/9issd_512.webp?width=512',
      'https://images.meesho.com/images/products/901552224/2c97j_512.webp?width=512',
      'https://images.meesho.com/images/products/906126483/siqbi_512.webp?width=512',
    ],
    yellow: [
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTxJMEH7gd1W8nG0pm6U0VfGCdYuJbmlms2rT-g6mux0g&s',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR2ftIx15A93Dpi-FdMpGjxLv7-jcwRX8jrinTwuFtxSw&s',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTxJMEH7gd1W8nG0pm6U0VfGCdYuJbmlms2rT-g6mux0g&s',
    ],
  },
  'knit-cardigan': {
    beige: [
      'https://www.bloomberri.com/cdn/shop/files/Bloomberri_textured_knit_cardigan_in_beige.png?v=1776585259&width=1350',
      'https://www.bloomberri.com/cdn/shop/files/Celine_Cardigan_by_Bloomberri.png?v=1776585259&width=1350',
      'https://www.bloomberri.com/cdn/shop/files/1_2eaf35c1-4483-4cfa-84c2-4b14d035e1fe.png?v=1776585259&width=2048',
    ],
    navy: [
      'https://www.aspiga.com/cdn/shop/files/Shopifyimageupdate--MerinoWoolSwingCardiganNavy_2_800x.jpg?v=1743498714',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQwD4fEzXKKfv9gW6Qj7lX4upQEVcgwiBwPI82bN8bfuA&s',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRyCDgdLcSv90UQUa6fQPmayv5_3ppcfVhChyMjzzao9g&s',
    ],
  },
  'high-waist-leggings': {
    black: [
      'https://www.only.in/cdn/shop/files/901462601_g1.jpg?v=1745914660&width=1080',
      'https://www.only.in/cdn/shop/files/901138302_g5.jpg?v=1745912771&width=1080',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTJObvw6l5-sFqW9MzljUoBgKD3obgZb2uWvg&s',
    ],
    charcoal: [
      'https://m.media-amazon.com/images/I/71hsLaYz8bL._AC_UY350_.jpg',
      'https://m.media-amazon.com/images/I/61zflgd2xWL._AC_UY350_.jpg',
      'https://m.media-amazon.com/images/I/61-YfKgvl1L._AC_UY350_.jpg',
    ],
  },
  'nike-air-max': {
    white: [
      'https://img.tatacliq.com/images/i30//437Wx649H/MP000000030071302_437Wx649H_202602141121471.jpeg',
      'https://images.vegnonveg.com/resized/1020X1200/14617/nike-air-max-90-whiteuniversity-red-6964eb812cde9.jpg?format=webp',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSbtnvzXqtj2ezOxbBmFG-EWXnSY_Myp5l_2g&s',
    ],
    black: [
      'https://m.media-amazon.com/images/I/71SP0iKSB1L._AC_UY1000_.jpg',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTFq2DUdaHLO5-cBgoAbRGha_tYh2U2XR_SIdwiORQsgg&s',
      'https://rukminim2.flixcart.com/image/300/300/xif0q/shoe/v/e/m/-original-imahgbrwn9amjavn.jpeg',
    ],
  },
  'adidas-ultraboost': {
    black: [
      'https://rukminim2.flixcart.com/image/480/640/xif0q/shoe/r/d/n/-original-imahfqnwmfekuxuu.jpeg?q=90',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRkPz-0JQah4kKHofWYW6BjGeL0QCLXmZL0HbTIABcTDg&s',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTC07OdMmQ3Vi4HHtYWVaBiYhFpOGE2LQY6OofU81653A&s',
    ],
  },
  'puma-running-shoes': {
    black: [
      'https://assets.ajio.com/medias/sys_master/root/20231212/pMrm/6578254eddf7791519c5798e/-473Wx593H-465738216-black-MODEL.jpg',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT2x7KkvjafwBpfBlb5HmZPL_dvz5JEf2SnBlKkl7l_TQ&s',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSqjlPQWshGWvg4iW7PJaTpepBLVxt2XR_0mQ&s',
    ],
    red: [
      'https://assets.myntassets.com/w_412,q_50,,dpr_3,fl_progressive,f_webp/assets/images/19102506/2022/9/26/7f5ca0dc-92e6-49b3-81ba-fdf7a1b3ca781664179929685-Fusion-Mens-Running-Shoes-5391664179929304-2.jpg',
      'https://assets.ajio.com/medias/sys_master/root/20221107/bLwd/6368a686aeb269659c74cb3a/-473Wx593H-469249878-red-MODEL2.jpg',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR2KFqjZngnhUsJAvioPGzkN2Iyf29bOYhuGg&s',
    ],
  },
  'stainless-steel-pan-set': {
    silver: [
      'https://bergnerhome.in/cdn/shop/files/IMG-3973_ebb8bbac-120f-47d1-825d-952722123e90.jpg?v=1752576901&width=2048',
    ],
    black: [
      'https://www.ikea.com/in/en/images/products/hemlagad-6-piece-cookware-set-non-stick-coating-black__1275004_pe930518_s5.jpg?f=s',
    ],
  },
  'non-stick-frypan': {
    black: [
      'https://assets.myntassets.com/w_412,q_50,,dpr_3,fl_progressive,f_webp/assets/images/productimage/2020/7/23/dae5177e-f9dd-4e6d-92cc-128b855144d21595455941472-2.jpg',
    ],
    red: [
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQJ73MqoUu7s-ocPU0b370EQzWOclq4lbbH2w&s',
    ],
  },
  'ceramic-table-vase': {
    white: [
      'https://5.imimg.com/data5/SELLER/Default/2025/7/528726166/WZ/DD/LM/227593833/roundvasewhite02-logo-jpg-500x500.jpg',
      'https://m.media-amazon.com/images/I/61i-mqIimOL._AC_UF894,1000_QL80_.jpg',
      'https://5.imimg.com/data5/SELLER/Default/2025/7/528727182/WQ/WF/FQ/227593833/round-ceramic-flower-vases.jpg',
    ],
    blue: [
      'https://assets.myntassets.com/w_412,q_50,,dpr_3,fl_progressive,f_webp/assets/images/2026/MARCH/3/KgPLCwL7_a06c8d4a5b9845c8b9831b2e61f214f4.jpg',
      'https://i.ebayimg.com/images/g/ELUAAeSwEmJqHN5g/s-l225.jpg',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSD2htY-8kGIR_jilRJWRS_en4f05D1XhmnOg&s',
    ],
    green: [
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTPfCVT6FmWejykAsVwFOsIJQb-PrYBX9uY5Q&s',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTlIbzG7EPxyZf0OemQ3gYVF_ELcmxnwTJfqQ&s',
      'https://morcee.in/cdn/shop/products/pokemon_mon-ball-set-of-2-11.jpg?v=1685298381&width=3840',
    ],
  },
  'scented-candle-set': {
    ivory: [
      'https://m.media-amazon.com/images/I/51nvXD9b9HL.jpg',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ6FAVbwKDP503MFivtHXe-VWuM-UNIi7quAP59OaJ7TQ&s',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQjq9p6ZLiq4Lx5jhC9CptEdWn9yjjWlsmElvZkVRh2Tg&s',
    ],
    amber: [
      'https://candlesupply.in/wp-content/uploads/2024/11/33_0209c5fa-5851-456b-83f8-c1989f5c8f57.jpg-e1731051663269.webp',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTKEUbz9aQ0dv8W9A_2AM-aopjhoDLiLjuez7oEmXpYHg&s',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTAKX6Rr8RN1UdPpYmaAS7u8y9efrmzwNcfqE8pbyYS7Q&s',
    ],
  },
  'ergonomic-office-chair': {
    black: [
      'https://m.media-amazon.com/images/I/71q4iWyyF2L.jpg',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQDsr-IB2CjiMCn64xTVlANYNY81V64nzfAbg&s',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQhPfKBOql9bHo5nCZ0oG72LFW2AcniECgHpBJ92j8lTQ&s',
    ],
    gray: [
      'https://m.media-amazon.com/images/I/71Yg8Bd+cpL.jpg',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSaJ1UXkgHIswzJIyk1PIeMshKwrRiWgyRfWA&s',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQEYta3kTfHamhg8IgPLJkJ7TKOTZpf780Axw&s',
    ],
  },
  'wooden-coffee-table': {
    oak: [
      'https://img.tatacliq.com/images/i27//450Wx545H/MP000000015324715_450Wx545H_202509190309121.jpeg',
      'https://img.tatacliq.com/images/i27//437Wx649H/MP000000015324715_437Wx649H_2025091903093010.jpeg',
      'https://m.media-amazon.com/images/I/41Ib1NP6JiS._AC_UF894,1000_QL80_.jpg',
    ],
    walnut: [
      'https://i.etsystatic.com/24607267/r/il/1cb2d2/2507469809/il_570xN.2507469809_lc37.jpg',
      'https://i.etsystatic.com/24607267/r/il/98e6cb/2928161194/il_1080xN.2928161194_govt.jpg',
      'https://i.etsystatic.com/24607267/r/il/eb9b9d/2507492111/il_fullxfull.2507492111_4gub.jpg',
    ],
  },
};
