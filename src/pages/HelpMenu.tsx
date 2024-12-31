import React, {useEffect, useState} from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

function createData(functionName: string, key: string) {
  return {functionName, key};
}

const rows = [
  createData('Move around plot', 'Arrow keys'),
  createData('Go to the very left right up down', 'Cmd + Arrow key'),
  createData('Select the first element', 'Cmd + fn + Left arrow'),
  createData('Select the last element', 'Cmd + fn + Right arrow'),
  createData('Toggle Braille Mode', 'b'),
  createData('Toggle Text Mode', 't'),
  createData('Toggle Sonification Mode', 's'),
  createData('Toggle Review Mode', 'r'),
  createData('Repeat current sound', 'Space'),
  createData(
    'Auto-play outward in direction of arrow',
    'Cmd + Shift + Arrow key'
  ),
  createData(
    'Auto-play inward in direction of arrow	',
    'Option + Shift + Arrow key'
  ),
  createData('Stop Auto-play', 'Cmd'),
  createData('Auto-play speed up', 'Period (.)'),
  createData('Auto-play speed down', 'Comma (,)'),
  createData('Auto-play speed reset', 'Slash (/)'),
  createData('Check label for the title of current plot', 'l t'),
  createData('Check label for the x axis of current plot', 'l x'),
  createData('Check label for the y axis of current plot', 'l y'),
  createData('Check label for the fill (z) axis of current plot', 'l f'),
  createData('Check label for the subtitle of current plot', 'l s'),
  createData('Check label for the caption of current plot', 'l c'),
  createData('Toggle AI Chat View', 'Option + Shift + /'),
  createData('Copy last chat message in AI Chat View', 'Option + Shift + C'),
  createData('Copy full chat history in AI Chat View', 'Option + Shift + A'),
];

export const HelpMenu: React.FC = () => {
  const [open, setOpen] = useState(true);

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <div>
      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>Help Dialog</DialogTitle>
        <DialogContent>
          <DialogContentText>
            <Typography variant="h6" gutterBottom>
              Keyboard Shortcuts
            </Typography>
            <TableContainer component={Paper}>
              <Table aria-label="simple table">
                <TableHead>
                  <TableRow>
                    <TableCell align="left">
                      <Typography variant="body1" fontWeight="bold">
                        Function
                      </Typography>
                    </TableCell>
                    <TableCell align="left">
                      <Typography variant="body1" fontWeight="bold">
                        Key
                      </Typography>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map(row => (
                    <TableRow
                      key={row.functionName}
                      sx={{'&:last-child td, &:last-child th': {border: 0}}}
                    >
                      <TableCell component="th" scope="row">
                        {row.functionName}
                      </TableCell>
                      <TableCell align="left">{row.key}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Divider />
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default HelpMenu;
