package com.springbootprojects.webpostingserver;

import com.springbootprojects.webpostingserver.posts.service.Mentions;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class MentionsTest {

    @Test void findsPlainMentionsAndLowercasesThem() {
        assertThat(Mentions.extract("hi @Alice and @bob_2!")).containsExactly("alice", "bob_2");
    }

    @Test void emailsAreNotMentions() {
        assertThat(Mentions.extract("write to a@b.com or me@example.org")).isEmpty();
    }

    @Test void punctuationAfterTheNameEndsIt() {
        assertThat(Mentions.extract("(@carol), @dave. @erin? @fran:")).containsExactly("carol", "dave", "erin", "fran");
    }

    @Test void duplicatesCountOnceAcrossLetterCase() {
        assertThat(Mentions.extract("@sam @SAM @Sam")).containsExactly("sam");
    }

    @Test void capsAtFive() {
        assertThat(Mentions.extract("@aaa @bbb @ccc @ddd @eee @fff @ggg")).hasSize(5).first().isEqualTo("aaa");
    }

    @Test void tooShortOrTooLongAreIgnored() {
        assertThat(Mentions.extract("@ab @" + "x".repeat(33))).isEmpty();
        assertThat(Mentions.extract("@" + "x".repeat(32))).hasSize(1);
    }

    @Test void doubleAtAndGluedAtAreIgnored() {
        assertThat(Mentions.extract("@@sam word@sam")).isEmpty();
    }

    @Test void nullAndEmpty() {
        assertThat(Mentions.extract(null)).isEqualTo(List.of());
        assertThat(Mentions.extract("")).isEmpty();
    }
}
