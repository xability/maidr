import type { Maidr } from '@model/grammar';
import { TestConstants } from '../util/constant';

export function verifyPlotLoaded(plotId: string): void {
  cy.get(TestConstants.SVG + TestConstants.HASH + plotId).should('exist');
}

export function verifyMaidrActivated(plotId: string): void {
  cy.get(TestConstants.HASH + plotId).click();
  cy.wait(TestConstants.ONE_MILLISECOND);
  cy.focused().should(TestConstants.HAVE_ATTR, TestConstants.HTML_ID, plotId);
}

export function verifyInstructionText(plotId: string): void {
  cy.get(TestConstants.HASH + plotId).click();
  cy.get(`#${TestConstants.MAIDR_NOTIFICATION_CONTAINER + plotId} ${TestConstants.PARAGRAPH}`)
    .invoke('text')
    .then((text) => {
      const normalizedText = text.replace(/\s+/g, ' ').trim();
      expect(normalizedText).to.equal(TestConstants.INSTRUCTION_TEXT);
    });
}

export function verifyLeftToRightMovement(maidrData: Maidr, elementId: string): void {
  cy.get(TestConstants.HASH + elementId).click();

  if (Array.isArray(maidrData.data)) {
    const numBars = maidrData.data.length;
    for (let i = 0; i < numBars; i++) {
      cy.realPress(TestConstants.RIGHT_ARROW_KEY);
    }
  }
}

export function verifyRightToLeftMovement(maidrData: Maidr, elementId: string): void {
  cy.get(TestConstants.HASH + elementId).click();
  if (Array.isArray(maidrData.data)) {
    const numBars = maidrData.data.length;
    // Move to the extreme right first.
    for (let i = 0; i < numBars; i++) {
      cy.realPress(TestConstants.RIGHT_ARROW_KEY);
    }
    // Then move back left, with a wait after each press.
    for (let i = numBars - 1; i >= 0; i--) {
      cy.realPress(TestConstants.LEFT_ARROW_KEY);
      cy.wait(TestConstants.ONE_MILLISECOND);
    }
  }
}

export function verifyToggleTextMode(elementId: string): void {
  cy.get(TestConstants.HASH + elementId).click();
  cy.realPress(TestConstants.TEXT_KEY);
  cy.wait(TestConstants.ONE_MILLISECOND);
  cy.contains(TestConstants.TEXT_MODE_TERSE).should(TestConstants.SHOULD_EXIST);

  cy.realPress(TestConstants.TEXT_KEY);
  cy.wait(TestConstants.ONE_MILLISECOND);
  cy.contains(TestConstants.TEXT_MODE_OFF).should(TestConstants.SHOULD_EXIST);

  cy.realPress(TestConstants.TEXT_KEY);
  cy.wait(TestConstants.ONE_MILLISECOND);
  cy.contains(TestConstants.TEXT_MODE_VERBOSE).should(TestConstants.SHOULD_EXIST);
}

export function verifyToggleBrailleMode(elementId: string): void {
  cy.get(TestConstants.HASH + elementId).click();
  cy.realPress(TestConstants.BRAILLE_KEY);
  cy.wait(TestConstants.ONE_MILLISECOND);
  cy.contains(TestConstants.BRAILLE_MODE_ON).should(TestConstants.SHOULD_EXIST);
  cy.realPress(TestConstants.BRAILLE_KEY);
  cy.wait(TestConstants.ONE_MILLISECOND);
  cy.contains(TestConstants.BRAILLE_MODE_OFF).should(TestConstants.SHOULD_EXIST);
}

export function verifyToggleSonification(elementId: string): void {
  cy.get(TestConstants.HASH + elementId).click();
  cy.realPress(TestConstants.SOUND_KEY);
  cy.wait(TestConstants.ONE_MILLISECOND);
  cy.contains(TestConstants.SOUND_MODE_OFF).should(TestConstants.SHOULD_EXIST);
  cy.realPress(TestConstants.SOUND_KEY);
  cy.wait(TestConstants.ONE_MILLISECOND);
  cy.contains(TestConstants.SOUND_MODE_ON).should(TestConstants.SHOULD_EXIST);
}

export function verifyIncreaseSpeed(elementId: string): void {
  cy.get(TestConstants.HASH + elementId).click();
  cy.realPress(TestConstants.PERIOD_KEY);
  cy.wait(TestConstants.ONE_MILLISECOND);
  cy.contains(TestConstants.SPEED_UP).should(TestConstants.SHOULD_EXIST);
}

export function verifyDecreaseSpeed(elementId: string): void {
  cy.get(TestConstants.HASH + elementId).click();
  cy.realPress(TestConstants.COMMA_KEY);
  cy.wait(TestConstants.ONE_MILLISECOND);
  cy.contains(TestConstants.SPEED_DOWN).should(TestConstants.SHOULD_EXIST);
}

export function verifyResetSpeed(elementId: string): void {
  cy.get(TestConstants.HASH + elementId).click();
  cy.realPress(TestConstants.SLASH_KEY);
  cy.wait(TestConstants.ONE_MILLISECOND);
  cy.contains(TestConstants.SPEED_RESET).should(TestConstants.SHOULD_EXIST);
}
