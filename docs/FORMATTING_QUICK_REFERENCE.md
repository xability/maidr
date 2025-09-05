# Data Formatting Quick Reference

## Configuration Location

```javascript
{
  layers: [
    {
      axes: {
        xAxisFormat: {
          /* X-axis formatting */
        },
        yAxisFormat: {
          /* Y-axis formatting */
        },
      },
    },
  ];
}
```

## Date Formatting Options

### Predefined Styles

```javascript
xAxisFormat: {
  dateFormat: {
    style: "short"; // "1/1/21"
    style: "medium"; // "Jan 1, 2021"
    style: "long"; // "January 1, 2021"
    style: "full"; // "Friday, January 1, 2021"
  }
}
```

### Custom Format Tokens

| Token  | Output        | Example |
| ------ | ------------- | ------- |
| `yyyy` | Full year     | `2021`  |
| `yy`   | 2-digit year  | `21`    |
| `MMM`  | Short month   | `Jan`   |
| `MM`   | 2-digit month | `01`    |
| `M`    | Month number  | `1`     |
| `dd`   | 2-digit day   | `01`    |
| `d`    | Day number    | `1`     |

### Custom Format Examples

```javascript
// "Jan 01, 2021"
customFormat: "MMM dd, yyyy";

// "2021-01-01"
customFormat: "yyyy-MM-dd";

// "01/01/21"
customFormat: "MM/dd/yy";

// "Friday, Jan 01"
customFormat: "EEEE, MMM dd";
```

## Price Formatting Options

### Basic Currency

```javascript
yAxisFormat: {
  priceFormat: {
    currency: "USD"; // "$1,234.56"
    currency: "EUR"; // "€1.234,56"
    currency: "JPY"; // "¥1,235"
  }
}
```

### Decimal Control

```javascript
yAxisFormat: {
  priceFormat: {
    currency: 'USD',
    minimumFractionDigits: 2,  // Always show 2 decimals
    maximumFractionDigits: 2,  // Max 2 decimals
    useGrouping: true          // Use thousands separators
  }
}
```

### Supported Currencies

| Code  | Symbol | Example      |
| ----- | ------ | ------------ |
| `USD` | $      | $1,234.56    |
| `EUR` | €      | €1.234,56    |
| `GBP` | £      | £1,234.56    |
| `JPY` | ¥      | ¥1,235       |
| `CAD` | C$     | C$1,234.56   |
| `AUD` | A$     | A$1,234.56   |
| `CHF` | CHF    | CHF 1'234.56 |
| `CNY` | ¥      | ¥1,234.56    |

## Complete Example

```javascript
{
  layers: [
    {
      id: "stock-chart",
      type: "candlestick",
      axes: {
        x: "date",
        y: "price",
        xAxisFormat: {
          dateFormat: {
            customFormat: "MMM dd, yyyy", // "Jan 01, 2021"
          },
        },
        yAxisFormat: {
          priceFormat: {
            currency: "USD",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
            useGrouping: true, // "$1,234.56"
          },
        },
      },
      data: [],
    },
  ];
}
```
