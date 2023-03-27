const puppeteer = require('puppeteer');
var json2csv = require('json2csv').parse;
const new_items = require('./items');
const fs = require('fs');
const path = require('path');

const xpaths = {
  Price: `//span[@itemprop='price']//ancestor::span[@class='vehicle-price-3']`,
  Year: `//h1//span[@itemprop='releaseDate']`,
  MakeModel1: `//h1//span[@itemprop='manufacturer']//ancestor::var`,
  MakeModel2: `//h1//span[@itemprop='model']//ancestor::var`,
  Transmission: `//td[contains(text(),'Transmission:')]/following-sibling::td`,
  Engine: `//td[contains(text(),'Engine:')]/following-sibling::td`,
  Trim: `//h1//span[@itemprop='model']`,
  DriveType: `//td[contains(text(),'Drivetrain:')]/following-sibling::td`,
  BodyStyle: `//td[contains(text(),'Body Style:')]/following-sibling::td`,

  ExteriorColor: `//td[contains(text(),'Exterior:')]/following-sibling::td`,
  InteriorColor: `//td[contains(text(),'Interior:')]/following-sibling::td`,
  FuelType: `//td[contains(text(),'Fuel type:')]/following-sibling::td`,

  StockNumber: `//td[contains(text(),'Stock #:')]/following-sibling::td`,

  Kilometers: `//span[@class='mileage-used-value']`,

  pictures: `//li/img[@itemprop='image']`,
};

const base_uri = 'https://www.beebaboysmotorclub.com';

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
  });
  var page = await browser.newPage();
  await page.goto(`${base_uri}/used`);
  const urls = await scrapeInfiniteScrollItems(page, extractItems, 215);
  for (let i = 0; i < urls.length; i++) {
    const uri = base_uri + urls[i].url;
    let items = [];
    await page.goto(uri, { waitUntil: 'networkidle2' });
    let item = new_items;
    item.url = uri;
    //Traversing All Xpaths for Each Item
    for (const key in xpaths) {
      x_path_value = xpaths[key];
      x_path_key = key;
      //actually Setting the field for each item in items object
      await setFields(page, x_path_key, x_path_value, item);
    }
    items.push(item);
    if (items.length > 0) {
      //add items to csv
      await write(Object.keys(items), items, `beebaboysmotorclub-listing.csv`);
    }
    console.log(`${i + 1} Product Done`);
  }

  console.log(`website Done`);
  await browser.close();
})();

// To Scroll Down
const scrapeInfiniteScrollItems = async (page, extractItems, itemsCount) => {
  let items = [];
  try {
    let previousHeight;
    while (items.length <= itemsCount) {
      items = await page.evaluate(extractItems);
      previousHeight = await page.evaluate('document.body.scrollHeight');
      await page.evaluate('window.scrollTo(0,document.body.scrollHeight)');
      await page.waitForFunction(
        `document.body.scrollHeight > ${previousHeight}`
      );
      await page.waitForTimeout(1000);
      // await new Promise((resolve) => setTimeout(resolve, 800));
    }
  } catch (err) {}
  return items;
};

function extractItems() {
  let urls = [];
  //it'll give all the links for cars
  let extractedElements = document.querySelectorAll(
    '.vehicle-year-make-model .stat-text-link'
  );
  //to get the href from a tags
  extractedElements.forEach((item) => {
    urls.push({
      url: item.getAttribute('href'),
      text: item.innerText,
    });
  });
  return urls;
}

const setFields = async (page, x_path_key, x_path_value, object) => {
  if (x_path_key == 'pictures') {
    //fetch all images src
    try {
      let imgs = await page.$x(x_path_value);
      let imgSrcs = await Promise.all(
        imgs.map(async (img) => {
          return await page.evaluate((el) => el.src, img);
        })
      );
      if (imgSrcs.length > 0) {
        //move first image to last in index
        imgSrcs.push(imgSrcs.shift());
      }
      imgSrcs = [...new Set(imgSrcs)];
      let imgSrcsString = imgSrcs.join([(separator = ';')]);
      Object.keys(object).forEach(function (key) {
        if (key == x_path_key) {
          object[x_path_key] = imgSrcsString.startsWith('data')
            ? ''
            : imgSrcsString;
        }
      });
    } catch (error) {}
  } else {
    try {
      let [data] = await page.$x(`${x_path_value}`);
      new_data = await page.evaluate((el) => el.innerText, data);

      Object.keys(object).forEach(function (key) {
        if (key == x_path_key) {
          object[x_path_key] = isNumField(x_path_key)
            ? sanitizeInt(new_data)
            : sanitizeString(new_data);
        }
      });
    } catch (error) {}
  }
};

function sanitizeString(str) {
  //remove \t and \n
  str = str.replace(/(\r\n|\n|\r|\t)/gm, '');
  //remove multiple spaces
  str = str.replace(/\s+/g, ' ');
  //remove leading and trailing spaces
  str = str.trim();
  return str;
}

function sanitizeInt(num) {
  num = num.replace(/[^0-9]/g, '');
  return num;
}

async function write(headersArray, dataJsonArray, fname) {
  const filename = path.join(__dirname, `${fname}`);
  let rows;
  // If file doesn't exist, we will create new file and add rows with headers.
  if (!fs.existsSync(filename)) {
    rows = json2csv(dataJsonArray, { header: true });
  } else {
    // Rows without headers.
    rows = json2csv(dataJsonArray, { header: false });
  }

  // Append file function can create new file too.
  fs.appendFileSync(filename, rows);
  // Always add new line if file already exists.
  fs.appendFileSync(filename, '\r\n');
}

const isNumField = (field) => {
  const numFields = ['Year', 'Kilometers', 'Price'];
  var isNum = false;
  for (let i = 0; i < numFields.length; i++) {
    if (field === numFields[i]) {
      isNum = true;
      break;
    }
  }
  return isNum;
};
