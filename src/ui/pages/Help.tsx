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
import { useAppDispatch, useAppSelector } from '@redux/hook/useStore';
import { loadHelpMenu, toggleHelpMenu } from '@redux/slice/helpSlice';
import React, { useEffect } from 'react';

const Help: React.FC = () => {
  const dispatch = useAppDispatch();
  const { enabled, items } = useAppSelector(state => state.helpMenu);

  useEffect(() => {
    dispatch(loadHelpMenu());
  }, [dispatch]);

  const handleClose = (): void => {
    dispatch(toggleHelpMenu());
  };

  return (
    <Dialog
      role="dialog"
      open={enabled}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      disablePortal
      closeAfterTransition={false}
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

export default Help;
