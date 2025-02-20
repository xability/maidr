import type { AppDispatch, RootState } from '@redux/store';
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
import { closeHelpMenu } from '@redux/helpMenuSlice';
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';

const HelpMenu: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { enabled, items } = useSelector((state: RootState) => state.helpMenu);

  const handleClose = (): void => {
    dispatch(closeHelpMenu());
  };

  return (
    <Dialog
      open={enabled}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      disablePortal
    >
      <DialogTitle>Help Dialog</DialogTitle>
      <DialogContent>
        <DialogContentText component="div">
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
                {items.map((item, index) => (
                  <TableRow key={index} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                    <TableCell component="th" scope="row">
                      {item.description}
                    </TableCell>
                    <TableCell align="left">{item.key}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Divider />
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} variant="contained" color="primary">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default HelpMenu;
