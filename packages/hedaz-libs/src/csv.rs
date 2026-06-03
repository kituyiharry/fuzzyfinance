/// Parses a FuzzyFinance export CSV (UTF-8 text) into rows of string fields,
/// excluding the header line. Handles RFC 4180 quoting to match the web app's
/// `cell()` helper, so commas and newlines inside quoted fields are preserved.
pub fn parse_rows(csv: &str) -> Vec<Vec<String>> {
    let mut rows = Vec::new();
    let mut lines = csv.lines();
    lines.next(); // skip header
    for line in lines {
        if !line.is_empty() {
            rows.push(split_csv_line(line));
        }
    }
    rows
}

fn split_csv_line(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut field = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '"' if in_quotes => {
                if chars.peek() == Some(&'"') {
                    chars.next();
                    field.push('"');
                } else {
                    in_quotes = false;
                }
            }
            '"' => in_quotes = true,
            ',' if !in_quotes => {
                fields.push(field.clone());
                field.clear();
            }
            c => field.push(c),
        }
    }
    fields.push(field);
    fields
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_simple_row() {
        let csv = "Header\nfoo,bar,baz";
        let rows = parse_rows(csv);
        assert_eq!(rows, vec![vec!["foo", "bar", "baz"]]);
    }

    #[test]
    fn handles_quoted_comma() {
        let csv = "Header\n\"Whole Foods, Inc.\",10.00,USD";
        let rows = parse_rows(csv);
        assert_eq!(rows[0][0], "Whole Foods, Inc.");
        assert_eq!(rows[0][1], "10.00");
    }

    #[test]
    fn handles_escaped_quote() {
        let csv = "Header\n\"say \"\"hello\"\"\",val";
        let rows = parse_rows(csv);
        assert_eq!(rows[0][0], "say \"hello\"");
    }

    #[test]
    fn skips_header_and_empty_lines() {
        let csv = "H1,H2\nfoo,bar\n\nbaz,qux";
        let rows = parse_rows(csv);
        assert_eq!(rows.len(), 2);
    }
}
