-- Insert sample levels data for testing
INSERT INTO levels (symbol, valid_from, close, em1, upper1, lower1, upper2, lower2, source) VALUES
('AAPL', '2024-01-15', 185.50, 5.25, 190.75, 180.25, 196.00, 174.00, 'sample_data'),
('AAPL', '2024-01-22', 188.20, 4.80, 193.00, 183.40, 197.80, 178.60, 'sample_data'),
('MSFT', '2024-01-15', 420.30, 12.50, 432.80, 407.80, 445.30, 395.30, 'sample_data'),
('MSFT', '2024-01-22', 425.60, 11.20, 436.80, 414.40, 448.00, 403.20, 'sample_data'),
('GOOGL', '2024-01-15', 142.80, 8.90, 151.70, 133.90, 160.60, 125.00, 'sample_data'),
('GOOGL', '2024-01-22', 145.20, 7.60, 152.80, 137.60, 160.40, 129.80, 'sample_data'),
('TSLA', '2024-01-15', 238.45, 18.30, 256.75, 220.15, 275.05, 201.85, 'sample_data'),
('TSLA', '2024-01-22', 242.10, 16.80, 258.90, 225.30, 275.70, 208.50, 'sample_data')
ON CONFLICT (symbol, valid_from) DO NOTHING;
