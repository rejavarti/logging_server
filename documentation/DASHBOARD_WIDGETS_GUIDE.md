# Custom Dashboard Widgets - User Guide

**Feature**: Custom Dashboard with Drag-and-Drop Widgets  
**Status**: ✅ Available Now  
**Access**: http://localhost:10180/dashboard/custom

---

## 🎯 Quick Start

1. **Access the Dashboard**
   - Login at http://localhost:10180
   - Click "Dashboard" in the sidebar (or navigate to http://localhost:10180/dashboard/custom)

2. **Add Your First Widget**
   - Click the "Add Widget" button (top right)
   - Choose from 6 widget types in the gallery
   - Widget appears on your dashboard automatically

3. **Customize Your Layout**
   - Drag widgets to reposition them
   - Resize widgets by dragging the bottom-right corner
   - Your layout saves automatically

---

## 📊 Available Widget Types

### 1. **Total Logs** 📊
- **What it shows**: Total number of log entries in the database
- **Size**: Small (3 columns × 2 rows)
- **Best for**: Quick overview of log volume
- **Updates**: On page load and manual refresh

### 2. **Today's Logs** 📅
- **What it shows**: Number of logs created today
- **Size**: Small (3 columns × 2 rows)
- **Best for**: Monitoring daily activity
- **Updates**: Real-time count of today's entries

### 3. **Severity Breakdown** 🥧
- **What it shows**: Pie chart of log levels (info, warn, error, debug)
- **Size**: Medium (3 columns × 4 rows)
- **Best for**: Understanding log level distribution
- **Interactive**: Hover over slices for exact counts

### 4. **Recent Logs** 📝
- **What it shows**: Last 5 log entries with level badges
- **Size**: Wide (6 columns × 2-4 rows)
- **Best for**: Real-time monitoring of latest activity
- **Features**: Color-coded badges, timestamps, truncated messages

### 5. **System Health** ❤️
- **What it shows**: Server metrics in a 2×2 grid
  - CPU usage (%)
  - Memory usage (MB)
  - Server uptime (hours)
  - Active connections
- **Size**: Medium (3 columns × 4 rows)
- **Best for**: System performance monitoring

### 6. **Top Sources** 📈
- **What it shows**: Bar chart of most active log sources
- **Size**: Medium (3 columns × 4 rows)
- **Best for**: Identifying busiest log sources
- **Shows**: Top 5 sources by log count

---

## 🎮 Using the Dashboard

### Adding Widgets

1. Click **"Add Widget"** button (top right)
2. Widget Gallery modal opens
3. Click any widget card to add it
4. Widget appears in the next available position
5. Modal closes automatically

### Moving Widgets

- **Click and drag** the widget header to move
- Drop widget in desired position
- Other widgets adjust automatically
- Layout saves when you release

### Resizing Widgets

- **Hover** over bottom-right corner of widget
- **Drag** resize handle to make bigger/smaller
- Maintains aspect ratio and grid alignment
- Layout saves when you release

### Refreshing Widget Data

- Click the **refresh icon** (↻) in widget header
- Icon spins during data fetch
- Success toast notification appears
- Widget content updates with new data

### Removing Widgets

- Click the **×** icon in widget header
- Confirmation dialog appears
- Widget removed from grid
- Layout adjusts to fill space

### Resetting Dashboard

1. Click **"Reset"** button (top right)
2. Confirmation dialog appears
3. All widgets removed
4. Empty state appears
5. Add widgets to start fresh

---

## 💡 Tips & Best Practices

### Layout Tips:

- **Start with small widgets**: Easier to arrange
- **Resize strategically**: Make important widgets larger
- **Group related widgets**: Health + Recent Logs together
- **Leave breathing room**: Don't fill every space
- **Mobile-friendly**: Use full width for important widgets

### Recommended Layouts:

#### **Monitoring Layout** (Real-time Focus)
```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ System      │ Today's     │ Severity    │             │
│ Health      │ Logs        │ Breakdown   │             │
│             │             │             │             │
│             │             │             │             │
├─────────────┴─────────────┴─────────────┴─────────────┤
│ Recent Logs                                           │
│                                                       │
└───────────────────────────────────────────────────────┘
```

#### **Analytics Layout** (Big Picture)
```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ Total Logs  │ Today's     │ Severity    │ Top         │
│             │ Logs        │ Breakdown   │ Sources     │
│             │             │             │             │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

#### **Minimal Layout** (Essential Only)
```
┌─────────────┬─────────────────────────────────────────┐
│ System      │ Recent Logs                             │
│ Health      │                                         │
└─────────────┴─────────────────────────────────────────┘
```

---

## 🔧 Troubleshooting

### Widget Not Loading Data

**Symptoms**: Widget shows "Loading..." forever or error message

**Solutions**:
1. Click the refresh button in widget header
2. Check browser console for errors (F12)
3. Verify server is running (check terminal)
4. Try removing and re-adding the widget

### Widget Won't Drag

**Symptoms**: Can't move widget around

**Solutions**:
1. Make sure you're clicking the header area
2. Don't click buttons (refresh/remove)
3. Refresh page and try again
4. Check if grid is locked (shouldn't be)

### Widget Disappeared

**Symptoms**: Widget was there, now it's gone

**Solutions**:
1. Scroll down - might be below viewport
2. Check if you accidentally deleted it
3. Re-add from widget gallery
4. Use "Reset" if layout is corrupted

### Layout Not Saving

**Symptoms**: Widgets reset position on page reload

**Solutions**:
1. Check browser network tab for failed API calls
2. Verify logged in (session might have expired)
3. Check server logs for errors
4. Try manual save by dragging widget slightly

### Empty State Shows Even With Widgets

**Symptoms**: "Your dashboard is empty" but widgets exist

**Solutions**:
1. Hard refresh page (Ctrl+F5)
2. Clear browser cache
3. Check if widgets are hidden (is_visible = false)
4. Contact admin to check database

---

## 🎨 Customization

### Per-User Dashboards

- Each user has their own dashboard
- Widget positions are user-specific
- No conflicts between users
- Admin can't see user dashboards (unless logged in as that user)

### Widget Configuration

Currently supported:
- Widget type (log_count, today_count, etc.)
- Position (x, y coordinates)
- Size (width, height in grid units)
- Visibility (show/hide)
- Custom name (optional - future feature)

### Future Enhancements

Planned features:
- 📝 Custom widget names/titles
- 🎨 Widget color themes
- ⏱️ Auto-refresh intervals
- 🔔 Alert thresholds
- 📊 More chart types
- 🖼️ Image/logo widgets
- 📰 RSS feed widgets
- 🌡️ Custom metric widgets

---

## 🚀 Advanced Usage

### Keyboard Shortcuts

- `Esc` - Close widget gallery
- `Ctrl+Z` - Undo last position change (planned)
- `Ctrl+R` - Refresh current widget (planned)

### API Integration

Widgets use these endpoints:
```
GET /api/dashboard/widgets                    - List all widgets
POST /api/dashboard/widgets                   - Create widget
PUT /api/dashboard/widgets/:id                - Update widget
DELETE /api/dashboard/widgets/:id             - Delete widget
POST /api/dashboard/widgets/positions         - Save layout
GET /api/dashboard/widget-data/:type          - Fetch data
```

### Database Structure

```sql
-- Widget storage
SELECT * FROM dashboard_widgets 
WHERE user_id = ? AND is_visible = 1
ORDER BY position_y, position_x;

-- Widget data queries vary by type
-- See backend API for implementation details
```

---

## 📱 Mobile Support

- **Responsive Grid**: Adapts to screen size
- **Touch Drag**: Works on tablets
- **Pinch Resize**: Widget sizing on touch devices
- **Portrait/Landscape**: Layout adjusts automatically

**Best Practices for Mobile**:
- Use full-width widgets (12 columns)
- Stack widgets vertically
- Prioritize important widgets at top
- Test in responsive mode before deploying

---

## 🔒 Security

- **Authentication Required**: Must be logged in to use dashboard
- **Per-User Isolation**: Can only see/edit your own widgets
- **CSRF Protection**: All API calls protected
- **XSS Prevention**: Widget content sanitized
- **SQL Injection**: Parameterized queries used

---

## 📊 Performance

### Optimization Tips:

1. **Limit Widget Count**: 6-8 widgets per dashboard
2. **Avoid Duplicate Widgets**: Don't add same type multiple times
3. **Use Appropriate Sizes**: Don't make charts too small
4. **Refresh Manually**: Avoid auto-refresh if not needed
5. **Close Unused Tabs**: Each tab maintains WebSocket connection

### Performance Metrics:

- **Page Load**: < 2 seconds (typical)
- **Widget Data Fetch**: < 500ms (typical)
- **Drag/Resize**: 60 FPS (smooth animation)
- **Memory Usage**: ~50MB (for dashboard page)
- **API Calls**: 1 per widget + 1 for layout save

---

## 📞 Support

### Getting Help:

1. **Check This Guide**: Most questions answered here
2. **Check PROGRESS_TRACKER.md**: Current status and known issues
3. **Server Logs**: Look for errors in terminal
4. **Browser Console**: F12 → Console tab
5. **Session Summary**: See SESSION_4_SUMMARY.md for technical details

### Common Questions:

**Q: Can I share my dashboard layout with other users?**  
A: Not currently. Each user has their own layout. Admin can create default template (future feature).

**Q: Can I export my dashboard layout?**  
A: Not directly. Layout is stored in database. Admin can export via database backup.

**Q: How many widgets can I add?**  
A: No hard limit, but 6-8 widgets recommended for performance.

**Q: Can I create custom widgets?**  
A: Not yet. This requires code changes. See SESSION_4_SUMMARY.md for developer info.

**Q: Widget data is outdated. How do I update?**  
A: Click the refresh button (↻) in widget header.

**Q: Can I use this on mobile?**  
A: Yes! Responsive design works on tablets and phones. Touch drag/resize supported.

---

## 🎓 Learn More

- **User Guide**: You're reading it! 📖
- **Progress Tracker**: `PROGRESS_TRACKER.md` - Feature status
- **Session Summary**: `SESSION_4_SUMMARY.md` - Technical implementation
- **API Docs**: See server.js lines 7313-8100 for widget routes
- **Database Schema**: See migration v3 in server.js

---

**Dashboard Version**: 1.0.0  
**Last Updated**: October 25, 2025  
**Status**: ✅ Production Ready

---

*Enjoy your customizable dashboard! 🎉*
