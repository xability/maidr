import type { MaidrLayer } from '@type/maidr';
import { TestConstants } from '../../util/constant';
import * as helper from '../../util/helper';
import 'cypress-real-events/support';

describe('Bar Plot', () => {
  let maidrData: MaidrLayer;

  before(() => {
    // Visit the file and extract the maidr data before all tests
    cy.visit('examples/barplot.html');
    cy.window().then((window) => {
      maidrData = window.maidr.subplots[0][0].layers[0];
    });
  });

  beforeEach(() => {
    // Visit the file before each test
    cy.visit('examples/barplot.html');
  });

  it('should load the barplot with maidr data', () => {
    helper.verifyPlotLoaded(TestConstants.BAR_ID);
  });

  it('should activate maidr on click', () => {
    helper.verifyMaidrActivated(TestConstants.BAR_ID);
  });

  it('should display instruction text', () => {
    cy.get(TestConstants.HASH + TestConstants.BAR_ID).click();
    cy.get(`#${TestConstants.MAIDR_NOTIFICATION_CONTAINER + TestConstants.BAR_ID} ${TestConstants.PARAGRAPH}`)
      .invoke('text')
      .then((text) => {
        const normalizedText = text.replace(/\s+/g, ' ').trim();
        expect(normalizedText).to.equal(TestConstants.BAR_INSTRUCTION_TEXT);
      });
  });

  it('should be able to move from left to right', () => {
    helper.verifyHorizontalMovement(maidrData, TestConstants.BAR_ID, TestConstants.HORIZONTAL_FORWARD);
  });

  it('should be able to move from right to left', () => {
    // Move to right extreme point
    helper.verifyExtremePoint(TestConstants.BAR_ID, TestConstants.RIGHT);
    helper.verifyHorizontalMovement(maidrData, TestConstants.BAR_ID, TestConstants.HORIZONTAL_REVERSE);
  });

  it('toggle text mode', () => {
    helper.verifyToggleTextMode(TestConstants.BAR_ID);
  });

  it('toggle braille mode', () => {
    helper.verifyToggleBrailleMode(TestConstants.BAR_ID);
  });

  it('toggle sonification', () => {
    helper.verifyToggleSonification(TestConstants.BAR_ID);
  });

  it('should be able to increase speed', () => {
    helper.verifyIncreaseSpeed(TestConstants.BAR_ID);
  });

  it('should be able to decrease speed', () => {
    helper.verifyDecreaseSpeed(TestConstants.BAR_ID);
  });

  it('should be able to reset speed', () => {
    helper.verifyResetSpeed(TestConstants.BAR_ID);
  });

  it('should play left extreme point', () => {
    helper.verifyExtremePoint(TestConstants.BAR_ID, TestConstants.LEFT);
  });

  it('should play right extreme point', () => {
    helper.verifyExtremePoint(TestConstants.BAR_ID, TestConstants.RIGHT);
  });

  it('should replay the same point', () => {
    helper.verifyReplaySamePoint(TestConstants.BAR_ID);
  });

  it('Braille Navigation - left to right', () => {
    helper.verifyBrailleNavigationForward(maidrData, TestConstants.BAR_ID);
  });

  it('Braille Navigation - right to left', () => {
    helper.verifyExtremePoint(TestConstants.BAR_ID, TestConstants.RIGHT);
    helper.verifyBrailleNavigationReverse(maidrData, TestConstants.BAR_ID);
  });

  it('Autoplay - left to right', () => {
    helper.verifyAutoplay(maidrData, TestConstants.BAR_ID, TestConstants.HORIZONTAL_FORWARD);
  });

  it('Autoplay - right to left', () => {
    helper.verifyExtremePoint(TestConstants.BAR_ID, TestConstants.RIGHT);
    helper.verifyAutoplay(maidrData, TestConstants.BAR_ID, TestConstants.HORIZONTAL_REVERSE);
  });
});
