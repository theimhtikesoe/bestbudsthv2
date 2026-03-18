function notFoundHandler(req, res) {
  res.status(404).json({ message: 'Route not found' });
}

function errorHandler(error, req, res, next) {
  const status = error.status || 500;
  const message = error.message || 'Internal Server Error';

  if (status >= 500) {
    console.error('[ERROR]', error);
  }

  res.status(status).json({ message });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
