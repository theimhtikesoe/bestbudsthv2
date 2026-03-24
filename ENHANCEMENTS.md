# Daily Reports - Enhancement Plan

## Phase 1: Analysis & Planning
- [x] Analyze existing project structure
- [x] Identify enhancement opportunities
- [ ] Create detailed implementation roadmap

## Phase 2: Excel Export
- [ ] Install exceljs dependency
- [ ] Create Excel export service
- [ ] Add separate sheets for Main/Flower and F&B
- [ ] Format Excel with headers, colors, and calculations
- [ ] Add export endpoint to API
- [ ] Integrate export button in frontend

## Phase 3: Item Classification
- [ ] Create item classifier service
- [ ] Implement unit price threshold logic (>50 THB = Main, ≤50 = F&B)
- [ ] Add special case mappings (e.g., Grape Soda → Main)
- [ ] Enhance Loyverse service with classification
- [ ] Add classification to receipt display

## Phase 4: Expense Tracking
- [ ] Extend database schema for expenses
- [ ] Create expense management endpoints
- [ ] Add expense form to frontend
- [ ] Implement expense list view
- [ ] Add expense category support (Taxi, Ice, Deli, etc.)
- [ ] Calculate net cash with expenses

## Phase 5: UI Enhancements
- [ ] Improve dashboard layout
- [ ] Add payment breakdown visualization
- [ ] Display receipt details table
- [ ] Add charts for sales trends
- [ ] Improve mobile responsiveness
- [ ] Add loading states and error handling

## Phase 6: Payment Breakdown
- [ ] Display cash entries with details
- [ ] Display card entries with details
- [ ] Display transfer entries
- [ ] Display discount entries
- [ ] Show receipt details in modal/expandable view

## Phase 7: Database Enhancements
- [ ] Add expenses table
- [ ] Add item_classifications table
- [ ] Add sync_history table
- [ ] Create migration scripts
- [ ] Add indexes for performance

## Phase 8: Testing & Optimization
- [ ] Test Excel export with various data
- [ ] Test item classification accuracy
- [ ] Test expense calculations
- [ ] Verify timezone handling
- [ ] Test edge cases (23:55:59, 00:00:02)
- [ ] Performance testing

## Phase 9: Deployment
- [ ] Update environment variables
- [ ] Test production build
- [ ] Deploy to Vercel
- [ ] Verify all features work in production
- [ ] Monitor for errors
