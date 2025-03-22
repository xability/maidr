import type { MaidrLayer } from '@type/maidr';
import { TestConstants } from '../../util/constant';
import * as helper from '../../util/helper';
import 'cypress-real-events/support';

describe('Heatmap', () => {
  let maidrData: MaidrLayer;

  before(() => {
    // Visit the file and extract the maidr data before all tests
    cy.visit('examples/heatmap.html');
    cy.window().then((window) => {
      maidrData = window.maidr.subplots[0][0].layers[0];
    });
  });

  beforeEach(() => {
    // Visit the file before each test
    cy.visit('examples/heatmap.html');
  });

  it('should load the heatmap with maidr data', () => {
    helper.verifyPlotLoaded(TestConstants.HEATMAP_ID);
  });

  it('should activate maidr on click', () => {
    helper.verifyMaidrActivated(TestConstants.HEATMAP_ID);
  });

  it('should display instruction text', () => {
    cy.get(TestConstants.HASH + TestConstants.HEATMAP_ID).click();
    cy.get(`#${TestConstants.MAIDR_NOTIFICATION_CONTAINER + TestConstants.HEATMAP_ID} ${TestConstants.PARAGRAPH}`)
      .invoke('text')
      .then((text) => {
        const normalizedText = text.replace(/\s+/g, ' ').trim();
        expect(normalizedText).to.equal(TestConstants.HEATMAP_INSTRUCTION_TEXT);
      });
  });

  it('should be able to move from left to right', () => {
    // Horizontal movement evaluated for first row only
    helper.verifyHorizontalMovement(maidrData, TestConstants.HEATMAP_ID, TestConstants.HORIZONTAL_FORWARD);
  });

  it('should be able to move from right to left', () => {
    // Move to right extreme point
    helper.verifyExtremePoint(TestConstants.HEATMAP_ID, TestConstants.RIGHT);
    // Horizontal movement evaluated for first row only
    helper.verifyHorizontalMovement(maidrData, TestConstants.HEATMAP_ID, TestConstants.HORIZONTAL_REVERSE);
  });

  it('toggle text mode', () => {
    helper.verifyToggleTextMode(TestConstants.HEATMAP_ID);
  });

  it('toggle braille mode', () => {
    helper.verifyToggleBrailleMode(TestConstants.HEATMAP_ID);
  });

  it('toggle sonification', () => {
    helper.verifyToggleSonification(TestConstants.HEATMAP_ID);
  });

  it('should be able to increase speed', () => {
    helper.verifyIncreaseSpeed(TestConstants.HEATMAP_ID);
  });

  it('should be able to decrease speed', () => {
    helper.verifyDecreaseSpeed(TestConstants.HEATMAP_ID);
  });

  it('should be able to reset speed', () => {
    helper.verifyResetSpeed(TestConstants.HEATMAP_ID);
  });

  it('should play left extreme point', () => {
    helper.verifyExtremePoint(TestConstants.HEATMAP_ID, TestConstants.LEFT);
  });

  it('should play right extreme point', () => {
    helper.verifyExtremePoint(TestConstants.HEATMAP_ID, TestConstants.RIGHT);
  });

  it('should replay the same point', () => {
    helper.verifyReplaySamePoint(TestConstants.HEATMAP_ID);
  });

  it('Braille Navigation - left to right', () => {
    helper.verifyBrailleNavigationForward(maidrData, TestConstants.HEATMAP_ID);
  });

  it('Braille Navigation - right to left', () => {
    helper.verifyExtremePoint(TestConstants.HEATMAP_ID, TestConstants.RIGHT);
    helper.verifyBrailleNavigationReverse(maidrData, TestConstants.HEATMAP_ID);
  });

  it('Autoplay - left to right', () => {
    helper.verifyAutoplay(maidrData, TestConstants.HEATMAP_ID, TestConstants.HORIZONTAL_FORWARD);
  });

  it('Autoplay - right to left', () => {
    helper.verifyExtremePoint(TestConstants.HEATMAP_ID, TestConstants.RIGHT);
    helper.verifyAutoplay(maidrData, TestConstants.HEATMAP_ID, TestConstants.HORIZONTAL_REVERSE);
  });
});
