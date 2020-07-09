const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const ObjectId = require('mongoose').Types.ObjectId;

const app = express();
app.use(bodyParser.json({extended: true}));
mongoose.connect('mongodb://localhost:27017/books', {useNewUrlParser: true, useUnifiedTopology: true});
mongoose.set('useFindAndModify', false);

const bookSchema = new mongoose.Schema({
    type: String,

    recommendation: String,
    state: String,
    starred: Boolean,

    rootTitle: String,
    title: String,
    authors: String,
    coverUrl: String,
    edition: Number,
    publisher: String,
    publishedYear: Number,
    pagesNumber: Number,

    category: String,
    subCategory: String,
    tags: [String],

    sources: [{name: String, location: String}],

    note: String,
    description: String
});
const Book = mongoose.model('Book', bookSchema);

app.get('/books', function(req, res){
    Book.find(function (err, books) {
        if (err) return console.error(err);
        res.send(books.map(mapBookForReturn));
    })
});

app.get('/books/:bookId', function(req, res){
    Book.findById(req.params.bookId, function (err, book) {
        if (err) return console.error(err);
        res.send(mapBookForReturn(book));
    })
});

mapBookForReturn = function(book) {
    return {
        id: book._id,
        type: book.type, recommendation: book.recommendation, state: book.state, starred: book.starred,
        rootTitle: book.rootTitle, title: book.title,
        authors: book.authors,
        coverUrl: book.coverUrl,
        edition: book.edition, publisher: book.publisher, publishedYear: book.publishedYear, pagesNumber: book.pagesNumber,
        category: book.category, subCategory: book.subCategory,
        tags: book.tags,
        sources: book.sources ? book.sources.map(source => new Object({name: source.name, location: source.location})) : [],
        note: book.note,
        description: book.description
    }
}

mapBookForUpdate = function(book) {
    return {
        type: book.type, recommendation: book.recommendation, state: book.state, starred: book.starred,
        rootTitle: book.rootTitle, title: book.title,
        authors: book.authors,
        coverUrl: book.coverUrl,
        edition: book.edition, publisher: book.publisher, publishedYear: book.publishedYear, pagesNumber: book.pagesNumber,
        category: book.category, subCategory: book.subCategory,
        tags: book.tags,
        sources: book.sources ? book.sources.map(source => new Object({name: source.name, location: source.location})) : [],
        note: book.note,
        description: book.description
    }
}

app.post('/books', function(req, res){
    const book = new Book(req.body);
    book.save().then(() => res.status(200).end()).catch(()=> res.send("error"));
});

app.put('/books/:bookId', async function(req, res) {
    const book = mapBookForUpdate(new Book(req.body));
    Book.findOneAndUpdate({_id: new ObjectId(req.params.bookId)}, book, function (err, book) {
        if (err) return res.send(err);
        res.status(200).end();
    })
});

app.listen(3001, function() {
    console.log("server has started on port 3001");
});
