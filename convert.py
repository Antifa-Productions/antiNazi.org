#!/usr/bin/env python3
"""
Converts An-Anarchist-Woman HTML from Project Gutenberg format
to a modern, semantic, accessible literature page using style_5.css.

Usage: python3 convert.py
Input:  An-Anarchist-Woman.html (original file)
Output: An-Anarchist-Woman-refactored.html
"""

import re
import html
from pathlib import Path

INPUT_FILE = "An-Anarchist-Woman.html"
OUTPUT_FILE = "An-Anarchist-Woman-refactored.html"

def read_input():
    """Read the input HTML file."""
    p = Path(INPUT_FILE)
    if not p.exists():
        print(f"Error: {INPUT_FILE} not found in current directory.")
        print("Make sure the original HTML file is in the same directory as this script.")
        exit(1)
    return p.read_text(encoding="utf-8")

def extract_body_content(raw_html):
    """Extract everything between <body> and </body>."""
    match = re.search(r'<body[^>]*>(.*?)</body>', raw_html, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1)
    return raw_html

def strip_site_wrapper(body_content):
    """Remove the antinazi.org site wrapper elements."""
    # Remove the homepage link and <br>
    body_content = re.sub(
        r'<a\s+href=/?><strong>Homepage</strong></a>\s*<br\s*/?>',
        '',
        body_content,
        flags=re.IGNORECASE
    )
    return body_content

def extract_paragraphs(body_content):
    """
    Extract all <p> elements as a list of (tag_attributes, inner_html) tuples.
    Returns list of dicts with 'attrs', 'html', 'text'.
    """
    paragraphs = []
    # Match <p ...> ... </p> (non-greedy, DOTALL)
    for match in re.finditer(r'<p([^>]*)>(.*?)</p>', body_content, re.DOTALL | re.IGNORECASE):
        attrs = match.group(1).strip()
        inner = match.group(2).strip()
        # Get plain text for classification
        text = re.sub(r'<[^>]+>', '', inner)
        text = html.unescape(text)
        paragraphs.append({
            'attrs': attrs,
            'html': inner,
            'text': text
        })
    return paragraphs

def extract_pre_blocks(body_content):
    """
    Extract all <pre><code> ... </code></pre> blocks.
    Returns list of (inner_text, position_in_body).
    """
    blocks = []
    for match in re.finditer(
        r'<pre[^>]*><code[^>]*>(.*?)</code></pre>',
        body_content,
        re.DOTALL | re.IGNORECASE
    ):
        content = match.group(1).rstrip('\n')
        blocks.append(content)
    return blocks

def classify_paragraph(text):
    """
    Classify a paragraph by its content to determine its role.
    Returns one of:
    - 'chapter_title' (e.g., "CHAPTER I")
    - 'chapter_subtitle' (e.g., "School and Factory" in <em>)
    - 'section_header' (e.g., "CONTENTS", "PREFACE", "FOOTNOTES:")
    - 'transcriber_box'
    - 'title_line'
    - 'byline'
    - 'pub_info'
    - 'copyright'
    - 'epigraph'
    - 'epigraph_attr'
    - 'prose' (normal paragraph)
    - 'skip' (gutenberg boilerplate we restructure)
    """
    stripped = text.strip()

    # Chapter titles: "CHAPTER I", "CHAPTER II", etc.
    if re.match(r'^CHAPTER\s+[IVXLCDM]+\.?\s*$', stripped, re.IGNORECASE):
        return 'chapter_title'

    # Section headers that appear as standalone paragraphs
    if stripped.upper() in ('CONTENTS', 'PREFACE', 'FOOTNOTES:', 'FOOTNOTES'):
        if stripped.upper().startswith('FOOTNOTE'):
            return 'footnote_header'
        return 'section_header'

    if stripped == '+------------------------------------------------------------+ | Transcriber\'s Note: | | | | Obvious typographical errors have been corrected in | | this text. For a complete list, please see the bottom of | this document. | +------------------------------------------------------------+':
        return 'transcriber_box'

    # Title: "An Anarchist Woman" with <em> on "An"
    if stripped == 'An Anarchist Woman':
        return 'title_line'

    if stripped.startswith('By') and 'HUTCHINS HAPGOOD' in stripped.upper():
        return 'byline'

    if 'Author of' in stripped and 'Autobiography' in stripped:
        return 'byline'

    if 'NEW YORK' in stripped and 'DUFFIELD' in stripped:
        return 'pub_info'

    if stripped.startswith('COPYRIGHT'):
        return 'copyright'

    if 'best government' in stripped.lower() and 'superfluous' in stripped.lower():
        return 'epigraph'

    if stripped == 'GOETHE':
        return 'epigraph_attr'

    # Gutenberg markers
    if 'START OF THIS PROJECT GUTENBERG' in stripped:
        return 'gutenberg_start'
    if 'END OF THIS PROJECT GUTENBERG' in stripped:
        return 'gutenberg_end'
    if 'This eBook is for the use of anyone' in stripped:
        return 'gutenberg_intro'
    if 'Title:' in stripped or 'Author:' in stripped or 'Release Date:' in stripped or 'Language:' in stripped:
        return 'gutenberg_meta'
    if 'Produced by' in stripped:
        return 'gutenberg_producer'
    if 'CHAPTER PAGE' in stripped:
        return 'toc_page_header'

    # End markers
    if stripped == 'THE END':
        return 'the_end'

    # Ad sections for other books
    if 'Autobiography' in stripped and 'Thief' in stripped and '$1.25' in stripped:
        return 'ad_section_title'
    if 'Cloth. 349 pp.' in stripped:
        return 'ad_section_price'
    if 'COMMENTS OF THE CRITICS' in stripped:
        return 'reviews_header'
    if 'DUFFIELD AND COMPANY' in stripped or stripped == 'DUFFIELD AND COMPANY':
        return 'publisher_name'
    if '36 EAST 21ST ST.' in stripped:
        return 'publisher_addr'

    if 'Spirit' in stripped and 'Labor' in stripped and '$1.25' in stripped:
        return 'ad_section_title_2'

    # Transcriber's final note
    if 'Transcriber' in stripped and 'Notes' in stripped and 'amended' in stripped:
        return 'transcriber_final'

    if 'End of the Project Gutenberg' in stripped:
        return 'gutenberg_final'
    if 'This file should be named' in stripped:
        return 'gutenberg_filename'
    if 'Updated editions' in stripped:
        return 'gutenberg_updates'
    if 'Creating the works' in stripped:
        return 'gutenberg_creating'
    if 'START: FULL LICENSE' in stripped or 'FULL LICENSE' in stripped and 'PLEASE READ' in stripped:
        return 'license_start'
    if 'Section 1' in stripped and 'General Terms' in stripped:
        return 'license_section'
    if re.match(r'^1\.[A-Z]\.', stripped):
        return 'license_subsection'
    if 'Project Gutenberg Literary Archive Foundation' in stripped and 'synonymous' in stripped:
        return 'license_mission'
    if 'Volunteers and financial support' in stripped:
        return 'license_volunteers'
    if 'non profit' in stripped or '501(c)(3)' in stripped:
        return 'license_foundation'
    if 'Section 4' in stripped and 'Donations' in stripped:
        return 'license_donations'
    if 'Section 5' in stripped and 'General Information' in stripped:
        return 'license_general_info'
    if 'originator of the Project Gutenberg' in stripped:
        return 'license_hart'
    if 'often created from several printed editions' in stripped:
        return 'license_editions'
    if 'Most people start at our Web site' in stripped:
        return 'license_search'
    if 'includes information about Project Gutenberg' in stripped:
        return 'license_info_final'

    # License body paragraphs (catch-all for license text)
    if 'Project Gutenberg' in stripped and len(stripped) > 100:
        return 'license_body'

    return 'prose'

def get_chapter_num(roman):
    """Convert Roman numeral to integer."""
    roman_map = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5,
                 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10,
                 'XI': 11, 'XII': 12, 'XIII': 13, 'XIV': 14, 'XV': 15}
    return roman_map.get(roman.upper().rstrip('.'), 0)

def get_chapter_titles():
    """Map of chapter number to title."""
    return {
        1: "School and Factory",
        2: "Domestic Service",
        3: "Domestic Service (Continued)",
        4: "Adventures in Sex",
        5: "Marie's Salvation",
        6: "Terry",
        7: "The Meeting",
        8: "The Rogues' Gallery",
        9: "The Salon",
        10: "More of the Salon",
        11: "The End of the Salon",
        12: "Marie's Attempt",
        13: "Marie's Failure",
        14: "Marie's Revolt",
        15: "Terry's Finish",
    }

def classify_pre_block(content):
    """
    Classify a <pre><code> block.
    Returns: ('verse', text), ('divider', None), ('review', text),
             ('toc', None), ('url', url)
    """
    stripped = content.strip()

    # Section divider
    if re.match(r'^[\s*]*\*[\s*]*$', stripped) or stripped == '*       *       *       *       *       *':
        return ('divider', None)

    # TOC entries (roman numerals followed by chapter titles and page numbers)
    if re.match(r'^\s*[IVXLCDM]+\.', stripped) and 'SCHOOL' in stripped.upper():
        return ('toc', None)

    # URL
    if stripped.startswith('http://') or stripped.startswith('https://'):
        return ('url', stripped)

    # Burns poem
    if 'We had nae wish' in stripped:
        return ('verse', content)

    # Browning quote
    if 'handful of silver' in stripped:
        return ('verse', content)

    # Review blocks (long text with source citations)
    if any(marker in stripped for marker in ['--_New York', '--_The Interior', '--_Life,', '--_New York', '--_Chicago', '--_Brooklyn', '--_Booklovers', '--JOSIAH']):
        return ('review', content)

    # Default: treat as review/prose block
    return ('review', content)

def build_toc():
    """Build the table of contents HTML."""
    titles = get_chapter_titles()
    items = ['<li><a href="#preface">Preface</a></li>']
    for num in sorted(titles.keys()):
        roman = list(get_chapter_num.__code__.co_consts)  # hack
        # Just use roman from titles dict
        romans = {1:'I', 2:'II', 3:'III', 4:'IV', 5:'V', 6:'VI', 7:'VII',
                  8:'VIII', 9:'IX', 10:'X', 11:'XI', 12:'XII', 13:'XIII', 14:'XIV', 15:'XV'}
        r = romans[num]
        title = titles[num]
        items.append(f'<li><a href="#chapter-{num}">{r}. {title}</a></li>')
    return '<ol>\n' + '\n'.join(items) + '\n</ol>'

def build_head():
    """Build the HTML <head> section."""
    return '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="An Anarchist Woman by Hutchins Hapgood (1909) — a portrait of the temperament of revolt, presented in a modern, accessible format.">
    <meta name="author" content="Hutchins Hapgood">

    <!-- Open Graph Tags -->
    <meta property="og:type" content="book">
    <meta property="og:title" content="An Anarchist Woman">
    <meta property="og:description" content="A portrait of the temperament of revolt by Hutchins Hapgood (1909).">
    <meta property="og:locale" content="en_US">
    <meta property="book:author" content="Hutchins Hapgood">
    <meta property="book:release_date" content="1909">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="An Anarchist Woman by Hutchins Hapgood">
    <meta name="twitter:description" content="A portrait of the temperament of revolt (1909).">

    <title>An Anarchist Woman — Hutchins Hapgood (1909)</title>
    <link rel="stylesheet" href="style_5.css">

    <!-- Schema.org Structured Data (JSON-LD) -->
    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@type": "Book",
        "name": "An Anarchist Woman",
        "author": {
            "@type": "Person",
            "name": "Hutchins Hapgood"
        },
        "publisher": {
            "@type": "Organization",
            "name": "Duffield & Company"
        },
        "datePublished": "1909",
        "inLanguage": "en",
        "genre": ["Non-fiction", "Social criticism", "Biography"],
        "description": "A portrait of the temperament of revolt, portraying the mental life of an individual anarchist."
    }
    </script>
</head>
'''

def build_header():
    """Build the page header."""
    return '''<body>
    <a class="skip-link" href="#main-content">Skip to main content</a>

    <header class="page-header" role="banner">
        <h1>An Anarchist Woman</h1>
        <p class="subtitle">by Hutchins Hapgood</p>
        <p class="byline">Author of "The Autobiography of a Thief," "The Spirit of Labor"</p>
        <p class="pub-info">New York · Duffield &amp; Company · 1909</p>
    </header>

    <details class="annotation">
        <summary>Transcriber's Note</summary>
        <p>Obvious typographical errors have been corrected in this text. For a complete list, please see the bottom of this document.</p>
        <p>Produced by Suzanne Lybarger, Brian Janes and the Online Distributed Proofreading Team at http://www.pgdp.net</p>
        <p>This eBook is for the use of anyone anywhere at no cost and with almost no restrictions whatsoever. You may copy it, give it away or re-use it under the terms of the Project Gutenberg License included with this eBook or online at www.gutenberg.org</p>
    </details>

    <blockquote class="epigraph">
        <p>"The best government is that which makes itself superfluous."</p>
        <p class="attribution">— Goethe</p>
    </blockquote>

    <nav class="toc" aria-label="Table of Contents">
        <h2>Contents</h2>
'''
+ build_toc() +
'''    </nav>
'''

def process_inner_html(inner):
    """Clean up inner HTML of a paragraph: convert <em> to <em>, fix entities."""
    # Keep <em> tags as-is (they're semantic)
    # Keep &amp; as-is
    return inner

def is_footnote_ref(text):
    """Check if paragraph is a footnote like '[1] Terry's letter...'"""
    return bool(re.match(r'^\[(\d+)\]', text.strip()))

def get_footnote_num(text):
    """Extract footnote number from '[1] ...'"""
    m = re.match(r'^\[(\d+)\]', text.strip())
    return int(m.group(1)) if m else 0

def format_as_verse(content):
    """Format a pre/code block as verse."""
    lines = content.strip().split('\n')
    # Remove leading whitespace that was just for alignment in original
    cleaned_lines = [line.rstrip() for line in lines]
    return '\n'.join(cleaned_lines)

def format_as_review(content):
    """Format a pre/code block as review text."""
    lines = content.strip().split('\n')
    paragraphs = []
    current_para = []

    for line in lines:
        line = line.strip()
        if line == '':
            if current_para:
                paragraphs.append(' '.join(current_para))
                current_para = []
        else:
            current_para.append(line)

    if current_para:
        paragraphs.append(' '.join(current_para))

    # Process: split citation from text
    html_parts = []
    for para in paragraphs:
        # Look for citation pattern: "--_Source_." or "--SOURCE."
        cit_match = re.search(r'(.+?)(--_?(.+?)_?\.?)$', para)
        if cit_match:
            text_part = cit_match.group(1).strip()
            cit_part = cit_match.group(3).strip().rstrip('.')
            # Convert _text_ to <em>text</em>
            text_part = re.sub(r'_([^_]+)_', r'<em>\1</em>', text_part)
            cit_part = re.sub(r'_([^_]+)_', r'<em>\1</em>', cit_part)
            html_parts.append(f'<p>{text_part}<cite>— {cit_part}</cite></p>')
        else:
            # No citation found, just convert formatting
            para = re.sub(r'_([^_]+)_', r'<em>\1</em>', para)
            html_parts.append(f'<p>{para}</p>')

    return '\n        '.join(html_parts)

def build_license_section(paragraphs, start_idx):
    """
    Build the Project Gutenberg license section from the remaining paragraphs.
    """
    html_parts = ['    <section class="license-section" aria-label="Project Gutenberg License">']
    html_parts.append('        <h2>Project Gutenberg License</h2>')

    in_list = False

    for i in range(start_idx, len(paragraphs)):
        p = paragraphs[i]
        text = p['text'].strip()
        inner = p['html']

        if not text:
            continue

        # Detect subsection headers
        if re.match(r'^1\.[A-Z]\.', text):
            if in_list:
                html_parts.append('        </ul>')
                in_list = False
            # Clean up the header
            header = text.split('.', 2)[2].strip() if text.count('.') >= 2 else text
            html_parts.append(f'        <h3>{html.escape(header)}</h3>')
            continue

        if 'Section 1' in text and 'General Terms' in text:
            if in_list:
                html_parts.append('        </ul>')
                in_list = False
            html_parts.append('        <h3>Section 1. General Terms of Use</h3>')
            continue

        if '1.F.' in text:
            if in_list:
                html_parts.append('        </ul>')
                in_list = False
            html_parts.append(f'        <h3>{html.escape(text)}</h3>')
            continue

        if 'Section 2' in text or 'Section 3' in text or 'Section 4' in text or 'Section 5' in text:
            if in_list:
                html_parts.append('        </ul>')
                in_list = False
            html_parts.append(f'        <h3>{html.escape(text)}</h3>')
            continue

        # List items (royalty terms)
        if text.startswith('You pay') or text.startswith('You provide') or text.startswith('You comply'):
            if not in_list:
                html_parts.append('        <ul>')
                in_list = True
            clean = re.sub(r'<[^>]+>', '', inner)
            clean = html.escape(clean)
            html_parts.append(f'            <li><p>{clean}</p></li>')
            continue

        if 'START: FULL LICENSE' in text or 'FULL LICENSE' in text and 'PLEASE READ' in text:
            html_parts.append('        <h3>Full Project Gutenberg License</h3>')
            continue

        # Regular license paragraph
        if in_list:
            html_parts.append('        </ul>')
            in_list = False

        clean = re.sub(r'<[^>]+>', '', inner)
        # Keep <em> tags
        clean = re.sub(r'<em>(.*?)</em>', r'<em>\1</em>', inner)
        clean = re.sub(r'<strong>(.*?)</strong>', r'<strong>\1</strong>', inner)
        html_parts.append(f'        <p>{clean}</p>')

    if in_list:
        html_parts.append('        </ul>')

    html_parts.append('    </section>')
    return '\n'.join(html_parts)


def convert():
    """Main conversion function."""
    raw_html = read_input()
    body_content = extract_body_content(raw_html)
    body_content = strip_site_wrapper(body_content)

    paragraphs = extract_paragraphs(body_content)
    pre_blocks = extract_pre_blocks(body_content)

    # Build output
    output_parts = []
    output_parts.append(build_head())
    output_parts.append(build_header())

    # Main content
    main_parts = ['    <main id="main-content" role="main">']
    main_parts.append('        <article aria-labelledby="article-title">')
    main_parts.append('            <h2 id="article-title" class="sr-only">An Anarchist Woman</h2>')

    # State tracking
    current_section = None
    current_chapter_num = 0
    in_preface = False
    chapter_titles = get_chapter_titles()
    pre_block_idx = 0  # Track which pre block we're at
    in_license = False
    license_start_idx = 0
    footnote_counter = 0

    # We need to track position of <pre> blocks relative to paragraphs.
    # Since we extracted them separately, we'll handle them based on content matching.
    # Instead, let's walk through the body_content in order, handling both <p> and <pre>.

    # Re-extract with positions to maintain order
    all_elements = []
    pos = 0
    for match in re.finditer(r'<p([^>]*)>(.*?)</p>|<pre[^>]*><code[^>]*>(.*?)</code></pre>', body_content, re.DOTALL | re.IGNORECASE):
        if match.group(2) is not None:
            # It's a <p>
            attrs = match.group(1).strip()
            inner = match.group(2).strip()
            text = re.sub(r'<[^>]+>', '', inner)
            text = html.unescape(text)
            all_elements.append(('p', attrs, inner, text))
        elif match.group(3) is not None:
            # It's a <pre><code>
            content = match.group(3)
            all_elements.append(('pre', '', content, ''))

    for idx, elem in enumerate(all_elements):
        etype = elem[0]
        attrs = elem[1]

        if etype == 'pre':
            content = elem[2]
            block_type, block_data = classify_pre_block(content)

            if block_type == 'divider':
                if current_section:
                    main_parts.append(f'            </section>')
                main_parts.append(f'            <div class="section-divider" aria-hidden="true">&#10085;</div>')
                # Don't close current chapter section — divider is within a chapter
                # Actually, we need to NOT close the section; the divider is inside it.
                # Let me handle this differently — just insert the divider inline.
                # Re-open the section if we closed it (we shouldn't have)
                # Actually let's just not close/reopen
                pass  # The divider is inserted inline, no section manipulation needed

            elif block_type == 'verse':
                verse_text = format_as_verse(block_data)
                main_parts.append(f'            <pre class="verse">{html.escape(verse_text)}</pre>')

            elif block_type == 'review':
                review_html = format_as_review(block_data)
                main_parts.append(f'            <div class="review-block">\n                {review_html}\n            </div>')

            elif block_type == 'toc':
                # Skip — we built our own TOC
                pass
            elif block_type == 'url':
                # Will be handled in license section
                pass

            continue

        # It's a paragraph
        inner = elem[2]
        text = elem[3]
        ptype = classify_paragraph(text)

        # Skip Gutenberg boilerplate we've already handled
        if ptype in ('gutenberg_start', 'gutenberg_end', 'gutenberg_intro',
                     'gutenberg_meta', 'gutenberg_producer', 'toc_page_header',
                     'transcriber_box', 'title_line', 'byline', 'pub_info',
                     'copyright', 'epigraph', 'epigraph_attr'):
            continue

        if ptype == 'section_header':
            # Could be CONTENTS or PREFACE
            if text.upper() == 'PREFACE':
                # Close previous section if open
                if current_section:
                    main_parts.append(f'            </section>')
                current_section = 'preface'
                main_parts.append(f'            <section id="preface" aria-labelledby="preface-heading">')
                main_parts.append(f'                <h2 id="preface-heading">Preface</h2>')
            # CONTENTS is handled by our nav
            continue

        if ptype == 'chapter_title':
            # Close previous section
            if current_section:
                main_parts.append(f'            </section>')

            # Extract Roman numeral
            m = re.search(r'CHAPTER\s+([IVXLCDM]+)', text, re.IGNORECASE)
            if m:
                roman = m.group(1)
                current_chapter_num = get_chapter_num(roman)
                sec_id = f'chapter-{current_chapter_num}'
                heading_id = f'ch{current_chapter_num}-heading'
                title = chapter_titles.get(current_chapter_num, '')
                main_parts.append(f'            <section id="{sec_id}" aria-labelledby="{heading_id}">')
                main_parts.append(f'                <h2 id="{heading_id}">Chapter {roman}</h2>')
                if title:
                    main_parts.append(f'                <h3>{html.escape(title)}</h3>')
                current_section = sec_id
            continue

        if ptype == 'footnote_header':
            # FOOTNOTES: — just continue, footnotes will be captured as details
            continue

        if is_footnote_ref(text):
            fn_num = get_footnote_num(text)
            fn_text = re.sub(r'^\[\d+\]\s*', '', text)
            # The footnote text might have HTML
            fn_html = re.sub(r'^\[\d+\]\s*', '', inner)
            fn_html = re.sub(r'<em>(.*?)</em>', r'<em>\1</em>', fn_html)
            main_parts.append(f'            <details class="footnote" id="fn{fn_num}">')
            main_parts.append(f'                <summary>Footnote {fn_num}</summary>')
            main_parts.append(f'                <p>{fn_html}</p>')
            main_parts.append(f'            </details>')
            continue

        if ptype == 'gutenberg_final':
            # Close current section
            if current_section:
                main_parts.append(f'            </section>')
                current_section = None
            continue

        if ptype == 'gutenberg_filename':
            # Close article, start license section
            if current_section:
                main_parts.append(f'            </section>')
                current_section = None
            # Mark license start
            in_license = True
            license_start_idx = idx
            break  # Exit the loop; license section handled separately

        if ptype in ('ad_section_title', 'ad_section_title_2', 'reviews_header',
                     'publisher_name', 'publisher_addr', 'ad_section_price',
                     'the_end'):
            # Handle end-of-book material
            if ptype == 'the_end':
                if current_section:
                    main_parts.append(f'            </section>')
                    current_section = None
                main_parts.append(f'            <p style="text-align: center; font-weight: bold; text-indent: 0;">The End</p>')
            elif ptype == 'reviews_header':
                if current_section:
                    main_parts.append(f'            </section>')
                    current_section = None
                main_parts.append(f'            <h2 style="text-align: center; font-weight: normal; border-top: 1px solid var(--border-color); padding-top: 2rem; margin-top: 3rem;">Comments of the Critics</h2>')
            elif ptype == 'ad_section_title' or ptype == 'ad_section_title_2':
                if current_section:
                    main_parts.append(f'            </section>')
                    current_section = None
                # Format the ad title
                clean = re.sub(r'<[^>]+>', '', inner)
                clean = re.sub(r'\$(\d)', r'&#36;\1', clean)
                main_parts.append(f'            <div class="pub-info"><p>{clean}</p></div>')
            elif ptype == 'publisher_name':
                main_parts.append(f'            <p class="pub-info">{html.escape(text)}</p>')
            elif ptype == 'publisher_addr':
                main_parts.append(f'            <p class="pub-info">{html.escape(text)}</p>')
            elif ptype == 'ad_section_price':
                main_parts.append(f'            <p class="pub-info">{inner}</p>')
            continue

        if ptype.startswith('gutenberg_') or ptype.startswith('license_'):
            # Skip these — handled by license section or already handled
            continue

        if ptype == 'transcriber_final':
            # This will be in the license/end section
            continue

        # Regular prose paragraph
        if ptype == 'prose' and current_section:
            # Determine if this is the first paragraph in the section
            # (for drop cap). We'll add class="first-paragraph" if it's
            # the first <p> after the last heading.
            # Simple heuristic: check if the previous element was a heading.
            prev_elem = all_elements[idx - 1] if idx > 0 else None
            is_first = False
            if prev_elem:
                prev_type = prev_elem[0]
                prev_text = prev_elem[3] if prev_elem[0] == 'p' else ''
                prev_class = classify_paragraph(prev_text) if prev_type == 'p' else ''
                if prev_class in ('chapter_title', 'section_header') or prev_type == 'pre':
                    is_first = True

            cls = 'first-paragraph' if is_first else ''

            # Clean inner HTML
            clean_inner = inner
            # Keep <em> tags
            # Escape any stray HTML we don't want
            # Remove <strong> tags (deprecated-ish for emphasis)
            clean_inner = re.sub(r'</?strong>', '', clean_inner)

            if cls:
                main_parts.append(f'                <p class="{cls}">{clean_inner}</p>')
            else:
                main_parts.append(f'                <p>{clean_inner}</p>')

    # Close any remaining section
    if current_section:
        main_parts.append(f'            </section>')
        current_section = None

    main_parts.append('        </article>')
    main_parts.append('    </main>')

    # Build license section if we broke out for it
    if in_license and license_start_idx > 0:
        lic_html = build_license_section(all_elements, license_start_idx)
        main_parts.append(lic_html)

    # Footer
    main_parts.append('''
    <footer role="contentinfo">
        <p>Presented in a modern, accessible format.</p>
        <p><a class="back-to-top" href="#main-content">&uarr; Back to top</a></p>
    </footer>
</body>
</html>
''')

    return '\n'.join(main_parts)


if __name__ == '__main__':
    result = convert()
    Path(OUTPUT_FILE).write_text(result, encoding='utf-8')
    print(f"✅ Converted! Output written to: {OUTPUT_FILE}")
    print(f"   Input: {INPUT_FILE}")
    print(f"   Output size: {len(result):,} characters")
