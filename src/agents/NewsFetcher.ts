
import axios from 'axios';

declare var console: any;

export interface NewsItem {
    title: string;
    description: string;
    source: string;
    pubDate: string;
}

export class NewsFetcher {
    private rssUrls = [
        'https://cointelegraph.com/rss',
        'https://decrypt.co/feed'
    ];

    async fetchLatestNews(keyword: string = 'XRP'): Promise<NewsItem[]> {
        console.log(`📰 Fetching news for ${keyword}...`);
        let allNews: NewsItem[] = [];

        for (const url of this.rssUrls) {
            try {
                const response = await axios.get(url);
                const items = this.parseRSS(response.data);
                allNews = [...allNews, ...items];
            } catch (e: any) {
                console.error(`Error fetching RSS from ${url}:`, e.message);
            }
        }

        // Filter by keyword and unique titles
        const filtered = allNews.filter(item =>
        (item.title.toUpperCase().includes(keyword.toUpperCase()) ||
            item.description.toUpperCase().includes(keyword.toUpperCase()))
        );

        // Deduplicate
        const unique = filtered.filter((item, index, self) =>
            index === self.findIndex((t) => (t.title === item.title))
        );

        console.log(`✅ Found ${unique.length} news items for ${keyword}.`);
        return unique.slice(0, 5); // Return top 5
    }

    private parseRSS(xml: string): NewsItem[] {
        const items: NewsItem[] = [];
        // Simple Regex Parsing for MVP (robust XML parser recommended for production)
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;

        while ((match = itemRegex.exec(xml)) !== null) {
            const content = match[1] || '';
            const title = this.extractTag(content, 'title');
            const description = this.extractTag(content, 'description');
            const pubDate = this.extractTag(content, 'pubDate');
            const source = this.extractTag(content, 'source') || 'CryptoNews';

            // Clean basic HTML tags from description
            const cleanDesc = description.replace(/<[^>]*>?/gm, '');

            items.push({
                title: title.replace('<![CDATA[', '').replace(']]>', ''),
                description: cleanDesc.replace('<![CDATA[', '').replace(']]>', ''),
                source,
                pubDate
            });
        }
        return items;
    }

    private extractTag(xml: string, tagName: string): string {
        const regex = new RegExp(`<${tagName}>(.*?)<\/${tagName}>`, 's');
        const match = regex.exec(xml);
        return match && match[1] ? match[1].trim() : '';
    }
}
