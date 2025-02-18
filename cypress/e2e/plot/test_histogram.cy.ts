import type { Maidr } from '@model/grammar';
import { TestConstants } from '../../util/constant';
import { verifyDecreaseSpeed, verifyIncreaseSpeed, verifyInstructionText, verifyLeftToRightMovement, verifyMaidrActivated, verifyPlotLoaded, verifyResetSpeed, verifyRightToLeftMovement, verifyToggleBrailleMode, verifyToggleSonification, verifyToggleTextMode } from '../../util/helper';
import 'cypress-real-events/support';

describe('Histogram', () => {
  let maidrData: Maidr;

  before(() => {
    // Visit the file and extract the maidr data before all tests
    cy.visit('examples/histogram.html');
    cy.window().then((window) => {
      maidrData = window.maidr;
    });
  });

  beforeEach(() => {
    // Visit the file before each test
    cy.visit('examples/histogram.html');
  });

  it('should load the histogram with maidr data', () => {
    verifyPlotLoaded(TestConstants.HISTOGRAM_ID);
  });

  it('should activate maidr on click', () => {
    verifyMaidrActivated(TestConstants.HISTOGRAM_ID);
  });

  it('should display instruction text', () => {
    verifyInstructionText(TestConstants.HISTOGRAM_ID);
  });

  it('should be able to move from left to right', () => {
    verifyLeftToRightMovement(maidrData, TestConstants.HISTOGRAM_ID);
  });

  it('should be able to move from right to left', () => {
    verifyRightToLeftMovement(maidrData, TestConstants.HISTOGRAM_ID);
  });

  it('toggle text mode', () => {
    verifyToggleTextMode(TestConstants.HISTOGRAM_ID);
  });

  it('toggle braille mode', () => {
    verifyToggleBrailleMode(TestConstants.HISTOGRAM_ID);
  });

  it('toggle sonification', () => {
    verifyToggleSonification(TestConstants.HISTOGRAM_ID);
  });

  it('should be able to increase speed', () => {
    verifyIncreaseSpeed(TestConstants.HISTOGRAM_ID);
  });

  it('should be able to decrease speed', () => {
    verifyDecreaseSpeed(TestConstants.HISTOGRAM_ID);
  });

  it('should be able to reset speed', () => {
    verifyResetSpeed(TestConstants.HISTOGRAM_ID);
  });

  it('should play left extreme point', () => {
    cy.get(TestConstants.HASH + TestConstants.HISTOGRAM_ID).click();
    cy.realPress([TestConstants.META_KEY, TestConstants.LEFT_ARROW_KEY]);
    // TODO: Add validation for extreme left point
  });

  it('should play right extreme point', () => {
    cy.get(TestConstants.HASH + TestConstants.HISTOGRAM_ID).click();
    cy.realPress([TestConstants.META_KEY, TestConstants.RIGHT_ARROW_KEY]);
    // TODO: Add validation for extreme right point
  });

  it('should replay the same point', () => {
    cy.get(TestConstants.HASH + TestConstants.HISTOGRAM_ID).click();
    cy.realPress([TestConstants.META_KEY, TestConstants.RIGHT_ARROW_KEY]);
    cy.wait(TestConstants.ONE_MILLISECOND);
    cy.get(`#${TestConstants.MAIDR_INFO_CONTAINER + TestConstants.HISTOGRAM_ID} ${TestConstants.PARAGRAPH}`)
      .invoke(TestConstants.INVOKE_TEXT)
      .then((text) => {
        const pointData = text;
        cy.realPress(TestConstants.SPACE_KEY);
        cy.get(`#${TestConstants.MAIDR_INFO_CONTAINER + TestConstants.HISTOGRAM_ID} ${TestConstants.PARAGRAPH}`)
          .invoke(TestConstants.INVOKE_TEXT)
          .then((text) => {
            expect(text).to.equal(pointData);
          });
      });
    // TODO: Add validation for replaying the same point
  });
  it('Braille Navigation - left to right', () => {
    cy.get(TestConstants.HASH + TestConstants.HISTOGRAM_ID).click();
    if (Array.isArray(maidrData.data)) {
      const numBars = maidrData.data.length;
      cy.realPress(TestConstants.BRAILLE_KEY);
      cy.focused().should(TestConstants.HAVE_ID, TestConstants.BRAILLE_TEXTAREA + TestConstants.HISTOGRAM_ID);
      for (let i = 0; i < numBars; i++) {
        cy.realPress(TestConstants.RIGHT_ARROW_KEY);
      }
    }
  });

  it('Braille Navigation - right to left', () => {
    cy.get(TestConstants.HASH + TestConstants.HISTOGRAM_ID).click();
    if (Array.isArray(maidrData.data)) {
      const numBars = maidrData.data.length;
      cy.realPress(TestConstants.BRAILLE_KEY);
      cy.focused().should(TestConstants.HAVE_ID, TestConstants.BRAILLE_TEXTAREA + TestConstants.HISTOGRAM_ID);
      for (let i = 0; i < numBars; i++) {
        cy.realPress(TestConstants.RIGHT_ARROW_KEY);
      }
      for (let i = numBars - 1; i >= 0; i--) {
        cy.realPress(TestConstants.LEFT_ARROW_KEY);
      }
    }
  });

  it('Autoplay - left to right', () => {
    cy.get(TestConstants.HASH + TestConstants.HISTOGRAM_ID).click();
    if (Array.isArray(maidrData.data)) {
      const numBars = maidrData.data.length;
      cy.realPress([TestConstants.META_KEY, TestConstants.SHIFT_KEY, TestConstants.RIGHT_ARROW_KEY]);
      cy.wait(numBars * TestConstants.ONE_SECOND);
    }
  });

  it('Autoplay - right to left', () => {
    cy.get(TestConstants.HASH + TestConstants.HISTOGRAM_ID).click();
    if (Array.isArray(maidrData.data)) {
      const numBars = maidrData.data.length;
      for (let i = 0; i < numBars; i++) {
        cy.realPress(TestConstants.RIGHT_ARROW_KEY);
      }
      cy.realPress([TestConstants.META_KEY, TestConstants.SHIFT_KEY, TestConstants.LEFT_ARROW_KEY]);
      cy.wait(numBars * TestConstants.ONE_SECOND);
    }
  });
});
