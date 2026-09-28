import type { HelpMenuItem } from '@type/help';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  Typography,
} from '@mui/material';
import { useLocale } from '@state/hook/useLocale';
import { useModalContainer } from '@state/hook/useModalContainer';
import { useViewModel, useViewModelState } from '@state/hook/useViewModel';
import { groupBySection, HELP_SECTION_TITLES } from '@type/help';
import React, { useId } from 'react';

/**
 * One shortcut, as text: what it does and what to press.
 *
 * Read-only. A shortcut is changed in the settings dialog's Keyboard
 * Shortcuts tab; a row the reader changed there says so here, beside the
 * default it replaced.
 */
const HelpRow: React.FC<{ item: HelpMenuItem }> = ({ item }) => {
  const { t } = useLocale();
  const keyText = item.isCustom && item.defaultKey !== undefined
    ? t('keybinding.helpCustomKey', { key: item.key, defaultKey: item.defaultKey })
    : item.key;

  return (
    <Grid container spacing={1} sx={{ py: 1 }}>
      <Grid size={{ xs: 12, sm: 6 }}>
        <Typography variant="body2">
          {item.description}
        </Typography>
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <Typography variant="body2" fontWeight={300}>
          {keyText}
        </Typography>
      </Grid>
    </Grid>
  );
};

const Help: React.FC = () => {
  const id = useId();
  const { t } = useLocale();
  const viewModel = useViewModel('help');
  const { items } = useViewModelState('help');
  const { modalRef, container } = useModalContainer();

  const handleClose = (): void => {
    viewModel.toggle();
  };

  return (
    <Dialog
      id={id}
      role="dialog"
      open={true}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      disablePortal
      ref={modalRef}
      container={container}
    >
      {/* Header. `DialogTitle` is already a heading, so it carries the text
          directly — a heading `Typography` nested inside it would put
          "Keyboard Shortcuts" in the outline twice. */}
      <DialogTitle sx={{ fontWeight: 'bold' }}>
        {t('keybinding.helpTitle')}
      </DialogTitle>

      <DialogContent>
        {/* Where to change a key, since this list only shows them. */}
        <Typography variant="body2" sx={{ mb: 1 }}>
          {t('keybinding.helpChangeInSettings')}
        </Typography>

        {/* One heading per group, so a screen reader user can move between
            groups with their heading key instead of reading every row. A
            named group rather than a <section>: a labelled section is a
            landmark, and eight landmarks inside one dialog is noise. */}
        {groupBySection(items).map(group => (
          <div key={group.section} role="group" aria-labelledby={`${id}-${group.section}`}>
            <Typography
              id={`${id}-${group.section}`}
              component="h3"
              variant="subtitle1"
              sx={{ fontWeight: 'bold', mt: 2 }}
            >
              {t(HELP_SECTION_TITLES[group.section])}
            </Typography>
            <Grid container spacing={1}>
              {group.items.map((item, index) => (
                <React.Fragment key={item.commandKey ?? `${index}-${item.key}`}>
                  <Grid size={12}>
                    <HelpRow item={item} />
                  </Grid>
                  {index !== group.items.length - 1 && (
                    <Grid size={12}>
                      <Divider />
                    </Grid>
                  )}
                </React.Fragment>
              ))}
            </Grid>
          </div>
        ))}
      </DialogContent>

      {/* Footer Actions */}
      <Grid container component={DialogActions}>
        <Grid
          size="grow"
          container
          spacing={1}
          justifyContent="flex-end"
          sx={{ px: 2, py: 1 }}
        >
          <Grid size="auto">
            <Button variant="contained" color="primary" onClick={handleClose}>
              {t('keybinding.helpCloseButton')}
            </Button>
          </Grid>
        </Grid>
      </Grid>
    </Dialog>
  );
};

export default Help;
