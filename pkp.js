const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

const readData = () => {
  try {
    const data = fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

async function processTrains(anonymizedTrainsArray) {
  const timeStamp = Date.now();

  const trainsArray = anonymizedTrainsArray.map((train) => ({
    id: train.t,
    carrier: train.p,
    lat: train.s,
    lng: train.d,
    delayType: train.o,
    name: `${train.p}-${train.n}`,
    i: train.i,
    c: train.c,
    a: train.a,
    timeStamp: timeStamp,
  }))

  logger.log('Trains array:', trainsArray.length)


  const uniqueTrains = trainsArray.filter((train, index, self) =>
    index === self.findIndex((t) => t.id === train.id)
  )

  logger.log('Unique trains:', uniqueTrains.length)

  let delay0 = 0;
  let delay1 = 0
  let delay2 = 0


  for (const train of uniqueTrains) {
    if (train.delayType === 0) {
      delay0++
    }
    else if (train.delayType === 1) {
      delay1++
    }
    else if (train.delayType === 2) {
      delay2++
    }

  }

  const delayPercent = (delay1 + delay2) / uniqueTrains.length * 100;

  logger.log('Delay0:', delay0)
  logger.log('Delay1:', delay1)
  logger.log('Delay2:', delay2)

  logger.log('Delay percent:', delayPercent)

  const data = readData();

  data.push({
    timeStamp: timeStamp,
    notUniqueTrainsCount: trainsArray.length,
    trainsCount: uniqueTrains.length,
    delay0,
    delay1,
    delay2,
    delayPercent,
  });

  fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(data))

  return uniqueTrains.length;
}

async function fetchTrainsData() {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();

  const client = await page.target().createCDPSession()

  await client.send('Network.enable')

  let processedTrains = false;
  let resolveReturnPromise = null;
  let navigationFinished = false;
  let processedTrainsCount = null

  const timeout = setTimeout(async () => {
    logger.log('Timeout')

    await browser.close();

    resolveReturnPromise?.(processedTrainsCount);
  }, 30000);

  client.on('Network.webSocketFrameReceived', async ({ response }) => {
    logger.log('Network.webSocketFrameReceived', response.payloadData.length)

    try {
      const data = JSON.parse(response.payloadData.substring(0, response.payloadData.length - 1))

      if (data.type === 1 && !processedTrains) {
        processedTrains = true;

        processedTrainsCount = await processTrains(data.arguments[1]);

      }
      else {
        logger.log('Not a train data')
      }

      if (resolveReturnPromise && navigationFinished && processedTrains) {
        clearTimeout(timeout);

        await browser.close();

        resolveReturnPromise(processedTrainsCount);

        logger.log('Gentle close')
      }

    } catch (error) {
      logger.error('Error parsing JSON:', error)
      logger.log('Received data was:', response.payloadData)
    }
  })


  await page.setViewport({
    width: 1920,
    height: 1080
  });


  logger.log('Navigating to page');

  await page.goto('https://portalpasazera.pl/MapaPociagow', {
    waitUntil: 'networkidle0',
    timeout: 30000
  });

  navigationFinished = true;

  logger.log('Page loaded');

  return new Promise(resolve => {
    resolveReturnPromise = resolve;
  });
}

module.exports = {
  fetchTrainsData
}

